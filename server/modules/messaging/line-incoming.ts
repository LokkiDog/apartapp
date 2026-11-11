import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { MAX_MESSAGE_FILE_BYTES } from '../../../shared/contracts/messaging'
import { db } from '../../infrastructure/database/client'
import { messagingConnections, messagingContacts, messagingUpdates, organizations } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { parseMessagingJson } from './body'
import { saveIncomingMessage } from './incoming'
import { downloadLineFile, getLineProfile, verifyLineSignature } from './line'
import { decryptBotToken } from './secrets'

const envelopeSchema = z.object({ destination: z.string(), events: z.array(z.unknown()) })
const messageEventSchema = z.object({
  type: z.literal('message'),
  mode: z.literal('active'),
  webhookEventId: z.string().min(1).max(128),
  timestamp: z.number().int().nonnegative().max(8_640_000_000_000_000),
  source: z.object({ type: z.literal('user'), userId: z.string().regex(/^U[0-9a-f]{32}$/i) }),
  message: z.object({
    id: z.string().min(1).max(128),
    type: z.string(),
    text: z.string().max(10000).optional(),
    fileName: z.string().max(1024).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    contentProvider: z.object({ type: z.string() }).optional(),
  }),
})

function checkSignature(connection: typeof messagingConnections.$inferSelect | undefined, raw: Buffer, signature: string | undefined) {
  if (!connection || !verifyLineSignature(raw, signature, decryptBotToken(connection.webhookSecret)))
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return connection
}

export async function receiveLineWebhook(id: string, signature: string | undefined, raw: Buffer) {
  const scope = and(eq(messagingConnections.id, id), eq(messagingConnections.channel, 'line'))
  const connection = checkSignature(await db.query.messagingConnections.findFirst({ where: scope }), raw, signature)
  const parsed = envelopeSchema.safeParse(parseMessagingJson(raw))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid LINE webhook' })
  const { destination, events } = parsed.data
  if (destination !== connection.botId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  if (!events.length) {
    if (connection.verificationPending) {
      await db.transaction(async (tx) => {
        const [organization] = await tx.select().from(organizations)
          .where(eq(organizations.id, connection.organizationId)).for('update')
        if (!organization?.messagingEnabled || organization.status !== 'active') return
        const [row] = await tx.select().from(messagingConnections).where(scope)
        const current = checkSignature(row, raw, signature)
        if (current.verificationPending) {
          await tx.update(messagingConnections).set({
            connected: true, verificationPending: false, updatedAt: new Date(),
          }).where(scope)
        }
      })
    }
    return { ok: true }
  }

  for (const payload of events) {
    const event = messageEventSchema.safeParse(payload)
    if (!event.success) continue
    const { message, source, webhookEventId, timestamp } = event.data
    let storedKey: string | undefined
    try {
      await db.transaction(async (tx) => {
        const [organization] = await tx.select().from(organizations)
          .where(eq(organizations.id, connection.organizationId)).for('share')
        if (!organization?.messagingEnabled || organization.status !== 'active' ||
          (organization.messagingEnabledSince && timestamp < organization.messagingEnabledSince.getTime())) return
        const [row] = await tx.select().from(messagingConnections).where(scope)
        const current = checkSignature(row, raw, signature)
        if (!current.connected) return
        const [receipt] = await tx.insert(messagingUpdates).values({ connectionId: id, updateId: webhookEventId })
          .onConflictDoNothing().returning()
        if (!receipt) return

        const token = decryptBotToken(current.encryptedToken)
        const isImage = message.type === 'image'
        const hasFile = isImage || message.type === 'file'
        const attachment = hasFile && message.contentProvider?.type !== 'external' &&
          (message.fileSize ?? 0) <= MAX_MESSAGE_FILE_BYTES
          ? await downloadLineFile(token, message.id).catch(() => {
              throw createError({ statusCode: 502, statusMessage: 'LINE attachment download failed' })
            })
          : null
        const contact = await tx.query.messagingContacts.findFirst({ where: and(
          eq(messagingContacts.connectionId, id),
          eq(messagingContacts.externalId, source.userId),
        ) })
        const name = contact?.name || await getLineProfile(token, source.userId) || source.userId
        if (attachment) {
          storedKey = `${connection.organizationId}/messaging/incoming/${randomUUID()}`
          await fileStorage.put(storedKey, attachment.bytes)
        }
        const saved = await saveIncomingMessage(tx, {
          organizationId: connection.organizationId,
          connectionId: id,
          externalContactId: source.userId,
          externalMessageId: message.id,
          createdAt: new Date(timestamp),
          name,
          username: '',
          content: {
            text: message.text ?? '',
            unsupported: !hasFile && message.text === undefined,
            file: hasFile ? {
              name: (message.fileName || (isImage ? 'photo.jpg' : 'attachment')).slice(0, 255),
              mimeType: attachment?.mimeType || (isImage ? 'image/jpeg' : 'application/octet-stream'),
              size: attachment?.bytes.length ?? Math.min(message.fileSize ?? 0, 2147483647),
              available: Boolean(attachment),
              storageKey: storedKey,
            } : undefined,
          },
        })
        if (!saved && storedKey) {
          await fileStorage.remove(storedKey)
          storedKey = undefined
        }
      })
    } catch (error) {
      if (storedKey) await fileStorage.remove(storedKey).catch(() => {})
      throw error
    }
  }
  return { ok: true }
}
