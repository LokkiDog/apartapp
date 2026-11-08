import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import {
  messagingAttachments,
  messagingConnections,
  messagingContacts,
  messagingConversations,
  messagingMessages,
  messagingOutbox,
  organizations,
  users,
} from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { decryptBotToken } from './secrets'
import { telegramRequest, TelegramError } from './telegram'

export async function processMessagingOutbox() {
  // A worker may die after Telegram accepts a message. Never resend an expired lease.
  await db.transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(messagingOutbox)
      .where(lt(messagingOutbox.leaseUntil, new Date()))
      .for('update', { skipLocked: true })
    for (const job of expired) {
      await tx
        .update(messagingMessages)
        .set({ status: 'unknown' })
        .where(
          and(
            eq(messagingMessages.id, job.messageId),
            eq(messagingMessages.status, 'sending'),
          ),
        )
      await tx.delete(messagingOutbox).where(eq(messagingOutbox.id, job.id))
    }
  })
  const jobs = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ job: messagingOutbox })
      .from(messagingOutbox)
      .innerJoin(
        messagingMessages,
        eq(messagingMessages.id, messagingOutbox.messageId),
      )
      .where(
        and(
          eq(messagingMessages.status, 'pending'),
          lt(messagingOutbox.availableAt, new Date()),
          isNull(messagingOutbox.leaseUntil),
        ),
      )
      .orderBy(asc(messagingOutbox.availableAt))
      .limit(5)
      .for('update', { of: messagingOutbox, skipLocked: true })
    const claimed = []
    for (const { job } of rows) {
      const leaseToken = randomUUID()
      await tx
        .update(messagingOutbox)
        .set({
          leaseUntil: new Date(Date.now() + 120_000),
          leaseToken,
          attempts: job.attempts + 1,
        })
        .where(eq(messagingOutbox.id, job.id))
      await tx
        .update(messagingMessages)
        .set({ status: 'sending' })
        .where(
          and(
            eq(messagingMessages.id, job.messageId),
            eq(messagingMessages.status, 'pending'),
          ),
        )
      claimed.push({ ...job, leaseToken, attempts: job.attempts + 1 })
    }
    return claimed
  })
  await Promise.all(
    jobs.map(async (job) => {
      try {
        await db.transaction(async (tx) => {
          // Same lock as enabling/disabling a tenant. Once disabled, no new request can start.
          const [organization] = await tx
            .select()
            .from(organizations)
            .where(eq(organizations.id, job.organizationId))
            .for('share')
          const owned = and(
            eq(messagingOutbox.id, job.id),
            eq(messagingOutbox.leaseToken, job.leaseToken),
            gt(messagingOutbox.leaseUntil, new Date()),
          )
          const [lease] = await tx
            .select()
            .from(messagingOutbox)
            .where(owned)
            .for('update')
          if (!lease) return
          const [row] = await tx
            .select({
              message: messagingMessages,
              connection: messagingConnections,
              chatId: messagingContacts.externalId,
              author: {
                id: users.id,
                organizationId: users.organizationId,
                status: users.status,
                roles: users.roles,
                isSuperuser: users.isSuperuser,
              },
            })
            .from(messagingMessages)
            .innerJoin(
              messagingConversations,
              eq(messagingConversations.id, messagingMessages.conversationId),
            )
            .innerJoin(
              messagingContacts,
              eq(messagingContacts.id, messagingConversations.contactId),
            )
            .innerJoin(
              messagingConnections,
              eq(messagingConnections.id, messagingConversations.connectionId),
            )
            .leftJoin(users, eq(users.id, messagingMessages.authorId))
            .where(
              and(
                eq(messagingMessages.id, job.messageId),
                eq(messagingMessages.organizationId, job.organizationId),
              ),
            )
          const eligibleAuthor =
            row?.author &&
            row.author.status === 'active' &&
            (row.author.isSuperuser ||
              (row.author.organizationId === job.organizationId &&
                row.author.roles.includes('administrator')))
          if (
            !row ||
            !organization?.messagingEnabled ||
            organization.status !== 'active' ||
            !row.connection.connected ||
            !eligibleAuthor ||
            row.message.status !== 'sending'
          ) {
            await tx
              .update(messagingMessages)
              .set({ status: 'canceled' })
              .where(
                and(
                  eq(messagingMessages.id, job.messageId),
                  or(
                    eq(messagingMessages.status, 'pending'),
                    eq(messagingMessages.status, 'sending'),
                  ),
                ),
              )
            await tx.delete(messagingOutbox).where(owned)
            return
          }
          // Preserve order and stay under Telegram's per-chat limit across replicas.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${row.message.conversationId}))`,
          )
          const [earlier] = await tx
            .select({ id: messagingMessages.id })
            .from(messagingMessages)
            .where(
              and(
                eq(
                  messagingMessages.conversationId,
                  row.message.conversationId,
                ),
                eq(messagingMessages.direction, 'outgoing'),
                or(
                  eq(messagingMessages.status, 'pending'),
                  eq(messagingMessages.status, 'sending'),
                ),
                sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) < (select created_at, id from messaging_messages where id = ${row.message.id})`,
              ),
            )
            .limit(1)
          const [recent] = await tx
            .select({ id: messagingMessages.id })
            .from(messagingMessages)
            .where(
              and(
                eq(
                  messagingMessages.conversationId,
                  row.message.conversationId,
                ),
                eq(messagingMessages.status, 'sent'),
                eq(messagingMessages.direction, 'outgoing'),
                gt(messagingMessages.sentAt, new Date(Date.now() - 1100)),
              ),
            )
            .limit(1)
          if (earlier || recent) {
            await tx
              .update(messagingMessages)
              .set({ status: 'pending' })
              .where(eq(messagingMessages.id, job.messageId))
            await tx
              .update(messagingOutbox)
              .set({
                leaseUntil: null,
                leaseToken: null,
                availableAt: new Date(Date.now() + 1500),
                attempts: sql`${messagingOutbox.attempts} - 1`,
              })
              .where(owned)
            return
          }
          let body: Record<string, unknown> | FormData = {
            chat_id: row.chatId,
            text: row.message.text,
          }
          let method = 'sendMessage'
          const [attachment] = await tx
            .select()
            .from(messagingAttachments)
            .where(eq(messagingAttachments.messageId, row.message.id))
          // Preparation failures happen before calling Telegram, and are safe to mark failed.
          let token: string
          try {
            token = decryptBotToken(row.connection.encryptedToken)
            if (attachment) {
              const bytes = await fileStorage.get(attachment.storageKey!)
              body = new FormData()
              body.set('chat_id', row.chatId)
              body.set('caption', row.message.text)
              // Telegram's photo endpoint has a 10 MB limit. Larger images remain downloadable documents.
              const photo =
                ['image/jpeg', 'image/png'].includes(attachment.mimeType) &&
                bytes.length <= 10 * 1024 * 1024
              body.set(
                photo ? 'photo' : 'document',
                new Blob([new Uint8Array(bytes)], {
                  type: attachment.mimeType,
                }),
                attachment.name,
              )
              method = photo ? 'sendPhoto' : 'sendDocument'
            }
          } catch {
            await tx
              .update(messagingMessages)
              .set({ status: 'failed' })
              .where(eq(messagingMessages.id, job.messageId))
            await tx.delete(messagingOutbox).where(owned)
            return
          }
          try {
            const result = await telegramRequest<{ message_id: number }>(
              token,
              method,
              body,
            )
            if (!Number.isInteger(result?.message_id))
              throw new TelegramError('unknown')
            await tx
              .update(messagingMessages)
              .set({
                status: 'sent',
                sentAt: new Date(),
                externalId: String(result.message_id),
              })
              .where(eq(messagingMessages.id, job.messageId))
            await tx.delete(messagingOutbox).where(owned)
          } catch (error) {
            const outcome =
              error instanceof TelegramError ? error.outcome : 'unknown'
            if (outcome === 'retry' && job.attempts < 5) {
              const delay = Math.max(
                error instanceof TelegramError ? error.retryAfter : 30,
                2 ** job.attempts,
              )
              await tx
                .update(messagingMessages)
                .set({ status: 'pending' })
                .where(eq(messagingMessages.id, job.messageId))
              await tx
                .update(messagingOutbox)
                .set({
                  leaseUntil: null,
                  leaseToken: null,
                  availableAt: new Date(Date.now() + delay * 1000),
                })
                .where(owned)
            } else {
              await tx
                .update(messagingMessages)
                .set({ status: outcome === 'unknown' ? 'unknown' : 'failed' })
                .where(eq(messagingMessages.id, job.messageId))
              await tx.delete(messagingOutbox).where(owned)
            }
          }
        })
      } catch {
        // The committed lease is recovered as unknown if the DB fails during delivery.
        console.error('[messaging] delivery transaction failed')
      }
    }),
  )
}
