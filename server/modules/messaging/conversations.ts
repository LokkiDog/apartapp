import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import {
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
import { MAX_MESSAGE_FILE_BYTES } from '../../../shared/contracts/messaging'

export async function listConversations(actor: Actor, before?: string) {
  await assertMessagingAccess(actor)
  let cursor
  if (before) cursor = await findConversation(actor, before)
  const rows = await conversationQuery(actor)
    .where(
      and(
        eq(messagingConversations.organizationId, actor.organizationId),
        cursor
          ? sql`(${messagingConversations.lastMessageAt}, ${messagingConversations.id}) < (select last_message_at, id from messaging_conversations where id = ${cursor.id} and organization_id = ${actor.organizationId})`
          : undefined,
      ),
    )
    .orderBy(
      desc(messagingConversations.lastMessageAt),
      desc(messagingConversations.id),
    )
    .limit(50)
  return { items: rows, next: rows.length === 50 ? rows.at(-1)!.id : null }
}

function conversationQuery(actor: Actor) {
  return db
    .select({
      id: messagingConversations.id,
      name: messagingContacts.name,
      username: messagingContacts.username,
      unread: messagingConversations.unread,
      lastMessageAt: messagingConversations.lastMessageAt,
      stayId: messagingConversations.stayId,
      guestName: stays.guestName,
      checkInOn: stays.checkInOn,
      checkOutOn: stays.checkOutOn,
      apartmentName: apartments.name,
    })
    .from(messagingConversations)
    .innerJoin(
      messagingContacts,
      and(
        eq(messagingContacts.id, messagingConversations.contactId),
        eq(messagingContacts.organizationId, actor.organizationId),
      ),
    )
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

export async function findConversation(actor: Actor, id: string) {
  const conversation = await db.query.messagingConversations.findFirst({
    where: and(
      eq(messagingConversations.id, id),
      eq(messagingConversations.organizationId, actor.organizationId),
    ),
  })
  if (!conversation)
    throw createError({ statusCode: 404, statusMessage: 'Диалог не найден' })
  return conversation
}

export async function listMessages(
  actor: Actor,
  conversationId: string,
  before: string | undefined,
  limit: number,
) {
  await assertMessagingAccess(actor)
  await findConversation(actor, conversationId)
  const [conversation] = await conversationQuery(actor)
    .where(
      and(
        eq(messagingConversations.id, conversationId),
        eq(messagingConversations.organizationId, actor.organizationId),
      ),
    )
    .limit(1)
  const cursor = before
    ? await db.query.messagingMessages.findFirst({
        where: and(
          eq(messagingMessages.id, before),
          eq(messagingMessages.conversationId, conversationId),
          eq(messagingMessages.organizationId, actor.organizationId),
        ),
      })
    : null
  if (before && !cursor)
    throw createError({
      statusCode: 404,
      statusMessage: 'Сообщение не найдено',
    })
  const rows = await db
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.organizationId, actor.organizationId),
        eq(messagingMessages.conversationId, conversationId),
        cursor
          ? sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) < (select created_at, id from messaging_messages where id = ${cursor.id} and organization_id = ${actor.organizationId})`
          : undefined,
      ),
    )
    .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
    .limit(limit)
  const files = rows.length
    ? await db
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
    items: rows
      .map(
        ({
          externalId,
          requestId,
          authorId,
          organizationId,
          conversationId: ignored,
          ...row
        }) => ({
          ...row,
          attachments: files
            .filter((file) => file.messageId === row.id)
            .map(({ messageId, ...file }) => file),
        }),
      )
      .reverse(),
    next: rows.length === limit ? rows.at(-1)!.id : null,
  }
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
      const [connection] = await tx
        .select()
        .from(messagingConnections)
        .where(eq(messagingConnections.id, conversation.connectionId))
      if (!connection?.connected)
        throw createError({
          statusCode: 409,
          statusMessage: 'Telegram отключён',
        })
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
