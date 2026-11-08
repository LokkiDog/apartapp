import { createError } from 'h3'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import {
  messagingConnections,
  messagingContacts,
  messagingConversations,
  messagingMessages,
  messagingAttachments,
  messagingUpdates,
  organizations,
} from '../../infrastructure/database/schema'
import { verifyWebhookSecret } from './secrets'
import { telegramMessageContent, type TelegramMessage } from './telegram'

const fileSchema = z.object({
  file_id: z.string().max(500),
  file_size: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  file_name: z.string().max(1024).optional(),
  mime_type: z.string().max(200).optional(),
})
const incomingSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      message_id: z.number().int(),
      date: z.number().int().nonnegative(),
      chat: z.object({
        id: z.number().int(),
        type: z.string(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      }),
      text: z.string().max(10000).optional(),
      caption: z.string().max(10000).optional(),
      photo: z.array(fileSchema).max(20).optional(),
      document: fileSchema.optional(),
      voice: fileSchema.optional(),
      audio: fileSchema.optional(),
      video: fileSchema.optional(),
      video_note: fileSchema.optional(),
      animation: fileSchema.optional(),
      sticker: fileSchema.optional(),
    })
    .optional(),
})

export async function receiveTelegramUpdate(
  connectionId: string,
  secret: string | undefined,
  body: unknown,
) {
  const connection = await db.query.messagingConnections.findFirst({
    where: eq(messagingConnections.id, connectionId),
  })
  if (!connection || !verifyWebhookSecret(secret, connection.webhookSecret))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const update = incomingSchema.parse(body)
  await db.transaction(async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, connection.organizationId))
      .for('share')
    const [currentConnection] = await tx
      .select()
      .from(messagingConnections)
      .where(eq(messagingConnections.id, connection.id))
    // A connection may have been replaced while this request waited for the organization lock.
    if (
      !currentConnection ||
      !verifyWebhookSecret(secret, currentConnection.webhookSecret)
    )
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    const [receipt] = await tx
      .insert(messagingUpdates)
      .values({ connectionId, updateId: String(update.update_id) })
      .onConflictDoNothing()
      .returning()
    if (
      !receipt ||
      !organization?.messagingEnabled ||
      organization.status !== 'active' ||
      !currentConnection.connected
    )
      return
    const message = update.message as TelegramMessage | undefined
    if (!message || message.chat.type !== 'private') return
    if (
      organization.messagingEnabledSince &&
      message.date <
        Math.floor(organization.messagingEnabledSince.getTime() / 1000)
    )
      return
    const content = telegramMessageContent(message)
    const name =
      [message.chat.first_name, message.chat.last_name]
        .filter(Boolean)
        .join(' ') ||
      message.chat.username ||
      String(message.chat.id)
    const [contact] = await tx
      .insert(messagingContacts)
      .values({
        organizationId: connection.organizationId,
        connectionId,
        externalId: String(message.chat.id),
        name,
        username: message.chat.username ?? '',
      })
      .onConflictDoUpdate({
        target: [messagingContacts.connectionId, messagingContacts.externalId],
        set: {
          name,
          username: message.chat.username ?? '',
          updatedAt: new Date(),
        },
      })
      .returning()
    const [conversation] = await tx
      .insert(messagingConversations)
      .values({
        organizationId: connection.organizationId,
        connectionId,
        contactId: contact!.id,
      })
      .onConflictDoUpdate({
        target: messagingConversations.contactId,
        set: { updatedAt: new Date() },
      })
      .returning()
    const [saved] = await tx
      .insert(messagingMessages)
      .values({
        organizationId: connection.organizationId,
        conversationId: conversation!.id,
        direction: 'incoming',
        text: content.text,
        unsupported: content.unsupported,
        status: 'sent',
        externalId: String(message.message_id),
        createdAt: new Date(message.date * 1000),
      })
      .onConflictDoNothing()
      .returning()
    if (!saved) return
    if (content.file)
      await tx.insert(messagingAttachments).values({
        ...content.file,
        size: Math.min(content.file.size, 2147483647),
        organizationId: connection.organizationId,
        messageId: saved.id,
      })
    await tx
      .update(messagingConversations)
      .set({
        unread: sql`${messagingConversations.unread} + 1`,
        lastMessageAt: sql`greatest(${messagingConversations.lastMessageAt}, ${new Date(message.date * 1000).toISOString()}::timestamptz)`,
        updatedAt: new Date(),
      })
      .where(eq(messagingConversations.id, conversation!.id))
  })
  return { ok: true }
}
