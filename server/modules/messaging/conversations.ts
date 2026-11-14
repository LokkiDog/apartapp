import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import {
  guests,
  messagingAttachments,
  messagingConnections,
  messagingContacts,
  messagingConversations,
  messagingMessages,
  messagingOutbox,
  organizations,
  stays,
  apartments,
} from '../../infrastructure/database/schema'
import type { Actor } from '../../infrastructure/auth/actor'
import { assertMessagingAccess, assertMessagingEnabled } from './access'
import { fileStorage } from '../../infrastructure/storage/local'
import { decryptBotToken } from './secrets'
import { downloadTelegramFile } from './telegram'
import { MAX_MESSAGE_FILE_BYTES, type MessagingChannel } from '../../../shared/contracts/messaging'

export async function listConversations(actor: Actor, before?: string) {
  await assertMessagingAccess(actor)
  const scopedChats = db.$with('scoped_chats').as(
    conversationQuery(actor, db).where(eq(messagingConversations.organizationId, actor.organizationId)),
  )
  const group = sql`partition by coalesce(${scopedChats.guestId}, ${scopedChats.id}), ${scopedChats.guestId} is not null`
  const chats = db.$with('inbox_chats').as(
    db.select({
      id: scopedChats.id,
      channel: scopedChats.channel,
      name: scopedChats.name,
      username: scopedChats.username,
      stayId: scopedChats.stayId,
      guestName: scopedChats.guestName,
      guestId: scopedChats.guestId,
      guestDisplayName: scopedChats.guestDisplayName,
      checkInOn: scopedChats.checkInOn,
      checkOutOn: scopedChats.checkOutOn,
      apartmentName: scopedChats.apartmentName,
      rank: sql<number>`row_number() over (${group} order by ${scopedChats.id})`.as('chat_rank'),
      threadUnread: sql<number>`sum(${scopedChats.unread}) over (${group})`.mapWith(Number).as('thread_unread'),
      threadActivity: sql<Date>`max(${scopedChats.lastMessageAt}) over (${group})`
        .mapWith(messagingConversations.lastMessageAt).as('thread_activity'),
      threadChannels: sql<MessagingChannel[]>`array_agg(${scopedChats.channel}) over (${group})`.as('thread_channels'),
    }).from(scopedChats),
  )
  const cursor = before
    ? db.select({ activity: chats.threadActivity, id: chats.id }).from(chats).where(and(
        eq(chats.rank, 1),
        sql`(${chats.id} = ${before} or ${chats.guestId} = (select guest_id from inbox_chats where id = ${before}))`,
      ))
    : null
  const rows = await db.with(scopedChats, chats).select().from(chats)
    .where(and(
      eq(chats.rank, 1),
      cursor ? sql`(${chats.threadActivity}, ${chats.id}) < (${cursor})` : undefined,
    ))
    .orderBy(desc(chats.threadActivity), desc(chats.id))
    .limit(51)
  return {
    items: rows.slice(0, 50).map(({ rank, threadActivity, threadUnread, threadChannels, ...row }) => ({
      ...row,
      lastMessageAt: threadActivity,
      unread: threadUnread,
      channels: [...new Set(threadChannels)].sort(),
    })),
    next: rows.length > 50 ? rows[49]!.id : null,
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const conversationFields = {
  id: messagingConversations.id,
  channel: messagingConnections.channel,
  connected: messagingConnections.connected,
  name: messagingContacts.name,
  username: messagingContacts.username,
  unread: messagingConversations.unread,
  lastMessageAt: messagingConversations.lastMessageAt,
  stayId: messagingConversations.stayId,
  guestName: stays.guestName,
  guestId: sql<string | null>`${guests.id}`.as('guest_id'),
  guestDisplayName: sql<string | null>`${guests.name}`.as('guest_display_name'),
  checkInOn: stays.checkInOn,
  checkOutOn: stays.checkOutOn,
  apartmentName: sql<string | null>`${apartments.name}`.as('apartment_name'),
}

function conversationQuery(
  actor: Actor,
  database: typeof db | Transaction,
) {
  return database
    .select(conversationFields)
    .from(messagingConversations)
    .innerJoin(
      messagingContacts,
      and(
        eq(messagingContacts.id, messagingConversations.contactId),
        eq(messagingContacts.organizationId, actor.organizationId),
      ),
    )
    .innerJoin(
      messagingConnections,
      and(
        eq(messagingConnections.id, messagingConversations.connectionId),
        eq(messagingConnections.organizationId, actor.organizationId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, messagingConversations.organizationId))
    .leftJoin(guests, and(
      eq(guests.id, messagingContacts.guestId),
      eq(guests.organizationId, actor.organizationId),
      eq(organizations.guestsEnabled, true),
    ))
    .leftJoin(
      stays,
      and(
        eq(stays.id, messagingConversations.stayId),
        eq(stays.organizationId, actor.organizationId),
      ),
    )
    .leftJoin(
      apartments,
      and(
        eq(apartments.id, stays.apartmentId),
        eq(apartments.organizationId, actor.organizationId),
      ),
    )
}

export async function listMessages(
  actor: Actor,
  conversationId: string,
  before: string | undefined,
  limit: number,
) {
  await assertMessagingAccess(actor)
  return db.transaction(async (tx) => {
    const organization = eq(messagingConversations.organizationId, actor.organizationId)
    const [conversation] = await conversationQuery(actor, tx)
      .where(and(eq(messagingConversations.id, conversationId), organization))
      .limit(1)
    if (!conversation)
      throw createError({ statusCode: 404, statusMessage: 'Диалог не найден' })

    const chats = conversation.guestId
      ? await conversationQuery(actor, tx).where(and(organization, eq(guests.id, conversation.guestId)))
      : [conversation]
    const sources = chats.map(({ id, channel, connected, name, username }) => ({
      id, channel, connected, name, username,
    }))
    const sourcesById = new Map(sources.map(source => [source.id, source]))
    const scope = and(
      eq(messagingMessages.organizationId, actor.organizationId),
      inArray(messagingMessages.conversationId, [...sourcesById.keys()]),
    )
    const [latestIncoming] = await tx.select({ conversationId: messagingMessages.conversationId })
      .from(messagingMessages)
      .where(and(scope, eq(messagingMessages.direction, 'incoming')))
      .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
      .limit(1)
    const cursor = before
      ? await tx.query.messagingMessages.findFirst({
          where: and(
            eq(messagingMessages.id, before),
            scope,
          ),
        })
      : null
    if (before && !cursor)
      throw createError({
        statusCode: 404,
        statusMessage: 'Сообщение не найдено',
      })
    const rows = await tx
      .select()
      .from(messagingMessages)
      .where(
        and(
          scope,
          cursor
            ? sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) < (select created_at, id from messaging_messages where id = ${cursor.id} and organization_id = ${actor.organizationId})`
            : undefined,
        ),
      )
      .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
      .limit(limit)
    const files = rows.length
      ? await tx
          .select({
            id: messagingAttachments.id,
            messageId: messagingAttachments.messageId,
            name: messagingAttachments.name,
            size: messagingAttachments.size,
            mimeType: messagingAttachments.mimeType,
            available: messagingAttachments.available,
          })
          .from(messagingAttachments)
          .where(
            and(
              eq(messagingAttachments.organizationId, actor.organizationId),
              inArray(
                messagingAttachments.messageId,
                rows.map((row) => row.id),
              ),
            ),
          )
      : []
    return {
      conversation,
      sources,
      replyTo: latestIncoming?.conversationId ?? conversationId,
      items: rows
        .map(
          ({
            externalId,
            requestId,
            authorId,
            organizationId,
            conversationId,
            ...row
          }) => ({
            ...row,
            conversationId,
            channel: sourcesById.get(conversationId)!.channel,
            attachments: files
              .filter((file) => file.messageId === row.id)
              .map(({ messageId, ...file }) => file),
          }),
        )
        .reverse(),
      next: rows.length === limit ? rows.at(-1)!.id : null,
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export async function updateConversation(
  actor: Actor,
  id: string,
  update: { stayId?: string | null; read?: boolean; through?: string },
) {
  await assertMessagingAccess(actor)
  await db.transaction(async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for('share')
    assertMessagingEnabled(organization)
    const [conversation] = await tx
      .select()
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.id, id),
          eq(messagingConversations.organizationId, actor.organizationId),
        ),
      )
      .for('update')
    if (!conversation)
      throw createError({ statusCode: 404, statusMessage: 'Диалог не найден' })
    if (update.stayId) {
      const [stay] = await tx
        .select({ id: stays.id })
        .from(stays)
        .where(
          and(
            eq(stays.id, update.stayId),
            eq(stays.organizationId, actor.organizationId),
          ),
        )
      if (!stay)
        throw createError({ statusCode: 404, statusMessage: 'Заезд не найден' })
    }
    if (update.read) {
      // Do not clear messages that arrived after the history displayed in the browser.
      const [latest] = await tx
        .select({ id: messagingMessages.id })
        .from(messagingMessages)
        .where(
          and(
            eq(messagingMessages.conversationId, id),
            eq(messagingMessages.direction, 'incoming'),
          ),
        )
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
        .limit(1)
      if (latest && latest.id !== update.through) return
    }
    await tx
      .update(messagingConversations)
      .set(
        update.read
          ? { unread: 0 }
          : { stayId: update.stayId, updatedAt: new Date() },
      )
      .where(eq(messagingConversations.id, id))
  })
  return { ok: true }
}

export type OutgoingFile = { data: Buffer; name: string; mimeType: string }
export async function enqueueMessage(
  actor: Actor,
  conversationId: string,
  input: { requestId: string; text: string },
  file?: OutgoingFile,
  threadId = conversationId,
) {
  await assertMessagingAccess(actor)
  if (
    (!input.text && !file) ||
    (file &&
      (file.data.length > MAX_MESSAGE_FILE_BYTES || input.text.length > 1024))
  )
    throw createError({
      statusCode: 422,
      statusMessage:
        'Сообщение пустое, файл больше 20 МБ или подпись длиннее 1024 символов',
    })
  const messageId = randomUUID()
  const storageKey = file
    ? `${actor.organizationId}/messaging/${messageId}/${randomUUID()}`
    : null
  if (file && storageKey) await fileStorage.put(storageKey, file.data)
  try {
    const result = await db.transaction(async (tx) => {
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .for('share')
      assertMessagingEnabled(organization)
      const [conversation] = await tx
        .select()
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, conversationId),
            eq(messagingConversations.organizationId, actor.organizationId),
          ),
        )
      if (!conversation)
        throw createError({
          statusCode: 404,
          statusMessage: 'Диалог не найден',
        })
      if (threadId !== conversationId) {
        const contacts = await tx
          .select({ guestId: messagingContacts.guestId })
          .from(messagingContacts)
          .innerJoin(messagingConversations, eq(messagingConversations.contactId, messagingContacts.id))
          .where(and(
            eq(messagingContacts.organizationId, actor.organizationId),
            eq(messagingConversations.organizationId, actor.organizationId),
            inArray(messagingConversations.id, [threadId, conversationId]),
          ))
          .orderBy(messagingContacts.id)
          .for('share', { of: messagingContacts })
        if (!organization?.guestsEnabled || contacts.length !== 2 || !contacts[0]?.guestId || contacts[0].guestId !== contacts[1]?.guestId)
          throw createError({
            statusCode: 409,
            statusMessage: 'Состав переписки изменился',
            data: { code: 'MESSAGING_THREAD_CHANGED' },
          })
      }
      const [connection] = await tx
        .select()
        .from(messagingConnections)
        .where(eq(messagingConnections.id, conversation.connectionId))
      if (!connection?.connected)
        throw createError({
          statusCode: 409,
          statusMessage: 'Канал сообщений отключён',
        })
      if (file && connection.channel === 'line')
        throw createError({ statusCode: 422, statusMessage: 'В LINE можно отправлять только текст' })
      const [message] = await tx
        .insert(messagingMessages)
        .values({
          id: messageId,
          organizationId: actor.organizationId,
          conversationId,
          direction: 'outgoing',
          text: input.text,
          requestId: input.requestId,
          authorId: actor.id,
          authorName: actor.name,
          status: 'pending',
        })
        .onConflictDoNothing()
        .returning()
      if (!message) {
        const [existing] = await tx
          .select()
          .from(messagingMessages)
          .where(
            and(
              eq(messagingMessages.organizationId, actor.organizationId),
              eq(messagingMessages.requestId, input.requestId),
            ),
          )
        if (existing?.conversationId !== conversationId)
          throw createError({
            statusCode: 409,
            statusMessage: 'Идентификатор отправки уже использован',
          })
        return { id: existing.id, duplicate: true }
      }
      if (file)
        await tx.insert(messagingAttachments).values({
          organizationId: actor.organizationId,
          messageId,
          storageKey,
          name: file.name.slice(0, 255),
          mimeType: file.mimeType,
          size: file.data.length,
        })
      await tx
        .insert(messagingOutbox)
        .values({ organizationId: actor.organizationId, messageId })
      await tx
        .update(messagingConversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(messagingConversations.id, conversationId))
      return { id: messageId, duplicate: false }
    })
    if (result.duplicate && storageKey) await fileStorage.remove(storageKey)
    return { id: result.id }
  } catch (error) {
    if (storageKey) await fileStorage.remove(storageKey).catch(() => {})
    throw error
  }
}

export async function getMessageAttachment(actor: Actor, id: string) {
  await assertMessagingAccess(actor)
  const [file] = await db
    .select()
    .from(messagingAttachments)
    .where(
      and(
        eq(messagingAttachments.id, id),
        eq(messagingAttachments.organizationId, actor.organizationId),
      ),
    )
  if (!file || !file.available || file.size > MAX_MESSAGE_FILE_BYTES)
    throw createError({ statusCode: 404, statusMessage: 'Вложение недоступно' })
  let content: Buffer
  if (file.storageKey) content = await fileStorage.get(file.storageKey)
  else {
    const [row] = await db
      .select({
        encryptedToken: messagingConnections.encryptedToken,
        connected: messagingConnections.connected,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .innerJoin(
        messagingConnections,
        eq(messagingConnections.id, messagingConversations.connectionId),
      )
      .where(
        and(
          eq(messagingMessages.id, file.messageId),
          eq(messagingMessages.organizationId, actor.organizationId),
        ),
      )
    if (!row?.connected || !file.externalFileId)
      throw createError({
        statusCode: 404,
        statusMessage: 'Вложение недоступно',
      })
    try {
      content = await downloadTelegramFile(
        decryptBotToken(row.encryptedToken),
        file.externalFileId,
      )
    } catch {
      throw createError({
        statusCode: 502,
        statusMessage: 'Не удалось скачать вложение из Telegram',
      })
    }
    await assertMessagingAccess(actor)
    const storageKey = `${actor.organizationId}/messaging/incoming/${file.id}`
    await fileStorage.put(storageKey, content)
    await db
      .update(messagingAttachments)
      .set({ storageKey, size: content.length })
      .where(eq(messagingAttachments.id, file.id))
  }
  await assertMessagingAccess(actor)
  return { content, name: file.name }
}
