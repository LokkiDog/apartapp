import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import {
  messagingConnections,
  messagingMessages,
  messagingOutbox,
  organizations,
} from '../../infrastructure/database/schema'
import type { Actor } from '../../infrastructure/auth/actor'
import { assertMessagingAccess, assertMessagingEnabled } from './access'
import { decryptBotToken, encryptBotToken } from './secrets'
import { telegramRequest } from './telegram'

export async function getConnection(actor: Actor) {
  await assertMessagingAccess(actor)
  const connection = await db.query.messagingConnections.findFirst({
    where: eq(messagingConnections.organizationId, actor.organizationId),
  })
  return {
    connected: connection?.connected ?? false,
    botName: connection?.botName ?? '',
    botUsername: connection?.botUsername ?? '',
    url: connection ? `https://t.me/${connection.botUsername}` : null,
  }
}

export async function connectTelegram(actor: Actor, token: string) {
  await assertMessagingAccess(actor)
  const encryptedToken = encryptBotToken(token)
  let bot: { id: number; is_bot: boolean; username: string; first_name: string }
  try {
    bot = await telegramRequest(token, 'getMe', {})
  } catch {
    throw createError({
      statusCode: 422,
      statusMessage: 'Не удалось проверить токен Telegram',
    })
  }
  if (!bot.is_bot || !bot.username)
    throw createError({
      statusCode: 422,
      statusMessage: 'Нужен токен Telegram-бота',
    })
  const base = new URL(useRuntimeConfig().public.appUrl)
  if (base.protocol !== 'https:')
    throw createError({
      statusCode: 503,
      statusMessage: 'Для Telegram нужен публичный HTTPS-адрес CRM',
    })
  try {
    await db.transaction(async (tx) => {
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .for('update')
      assertMessagingEnabled(organization)
      const [existing] = await tx
        .select()
        .from(messagingConnections)
        .where(eq(messagingConnections.organizationId, actor.organizationId))
      if (existing && existing.botId !== String(bot.id))
        throw createError({
          statusCode: 409,
          statusMessage:
            'Клиент уже использует другого бота. Подключите прежнего бота для сохранения диалогов.',
        })
      const webhookSecret =
        existing?.webhookSecret ?? randomBytes(32).toString('hex')
      const values = {
        organizationId: actor.organizationId,
        botId: String(bot.id),
        botName: bot.first_name,
        botUsername: bot.username,
        encryptedToken,
        webhookSecret,
        connected: true,
        updatedAt: new Date(),
      }
      const [connection] = existing
        ? await tx
            .update(messagingConnections)
            .set(values)
            .where(eq(messagingConnections.id, existing.id))
            .returning()
        : await tx.insert(messagingConnections).values(values).returning()
      // Keep the connection lock through registration. Webhooks can only see committed credentials.
      try {
        await telegramRequest(token, 'setWebhook', {
          url: new URL(
            `/api/messaging/telegram/${connection!.id}/webhook`,
            base,
          ).href,
          secret_token: webhookSecret,
          allowed_updates: ['message'],
          drop_pending_updates: !existing?.connected,
        })
      } catch {
        throw createError({
          statusCode: 502,
          statusMessage:
            'Не удалось зарегистрировать вебхук Telegram. Повторите подключение.',
        })
      }
    })
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505')
      throw createError({
        statusCode: 409,
        statusMessage: 'Этот бот уже подключён к другому клиенту',
      })
    throw error
  }
  return getConnection(actor)
}

export async function disconnectTelegram(actor: Actor) {
  await assertMessagingAccess(actor)
  await db.transaction(async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for('update')
    assertMessagingEnabled(organization)
    const [connection] = await tx
      .select()
      .from(messagingConnections)
      .where(eq(messagingConnections.organizationId, actor.organizationId))
    if (!connection) return
    await tx
      .update(messagingConnections)
      .set({ connected: false, updatedAt: new Date() })
      .where(eq(messagingConnections.id, connection.id))
    await tx
      .delete(messagingOutbox)
      .where(eq(messagingOutbox.organizationId, actor.organizationId))
    await tx
      .update(messagingMessages)
      .set({ status: 'unknown' })
      .where(
        and(
          eq(messagingMessages.organizationId, actor.organizationId),
          eq(messagingMessages.status, 'sending'),
        ),
      )
    await tx
      .update(messagingMessages)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(messagingMessages.organizationId, actor.organizationId),
          eq(messagingMessages.status, 'pending'),
        ),
      )
    // Local disconnect remains effective even when Telegram is unreachable.
    try {
      await telegramRequest(
        decryptBotToken(connection.encryptedToken),
        'deleteWebhook',
        { drop_pending_updates: true },
      )
    } catch {
      /* Server rejects further incoming messages. */
    }
  })
  return getConnection(actor)
}
