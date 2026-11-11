import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import type { LineConnection } from '../../../shared/contracts/messaging'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { messagingConnections, organizations } from '../../infrastructure/database/schema'
import { assertMessagingAccess, assertMessagingEnabled } from './access'
import { cancelConnectionQueue, connectionScope } from './connection'
import { getLineBot } from './line'
import { encryptBotToken } from './secrets'

function webhookUrl(id: string) {
  const base = useRuntimeConfig().public.appUrl
  const url = URL.canParse(base) ? new URL(`/api/messaging/line/${id}/webhook`, base) : null
  return url?.protocol === 'https:' ? url.href : null
}

export async function getLineConnection(actor: Actor): Promise<LineConnection> {
  await assertMessagingAccess(actor)
  const row = await db.query.messagingConnections.findFirst({
    where: connectionScope(actor.organizationId, 'line'),
  })
  return {
    connected: row?.connected ?? false,
    pending: row?.verificationPending ?? false,
    botName: row?.botName ?? '',
    botUsername: row?.botUsername ?? '',
    url: row ? `https://line.me/R/ti/p/${encodeURIComponent(row.botUsername)}` : null,
    webhookUrl: row && (row.connected || row.verificationPending) ? webhookUrl(row.id) : null,
  }
}

export async function connectLine(actor: Actor, token: string, secret: string) {
  await assertMessagingAccess(actor)
  if (!webhookUrl('check'))
    throw createError({ statusCode: 503, statusMessage: 'Для LINE нужен публичный HTTPS-адрес CRM' })
  const encryptedToken = encryptBotToken(token)
  const webhookSecret = encryptBotToken(secret)
  const bot = await getLineBot(token).catch(() => {
    throw createError({ statusCode: 422, statusMessage: 'Не удалось проверить токен LINE' })
  })
  try {
    await db.transaction(async (tx) => {
      const [organization] = await tx.select().from(organizations)
        .where(eq(organizations.id, actor.organizationId)).for('update')
      assertMessagingEnabled(organization)
      const [existing] = await tx.select().from(messagingConnections)
        .where(connectionScope(actor.organizationId, 'line'))
      if (existing && existing.botId !== bot.userId)
        throw createError({ statusCode: 409, statusMessage: 'Подключите прежний аккаунт LINE для сохранения диалогов' })
      const values = {
        botId: bot.userId,
        botName: bot.displayName,
        botUsername: bot.basicId,
        encryptedToken,
        webhookSecret,
        verificationPending: true,
        connected: false,
        updatedAt: new Date(),
      }
      if (existing) {
        await cancelConnectionQueue(tx, actor.organizationId, existing.id)
        await tx.update(messagingConnections).set(values).where(eq(messagingConnections.id, existing.id))
      } else {
        await tx.insert(messagingConnections).values({ ...values, organizationId: actor.organizationId, channel: 'line' })
      }
    })
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } }
    if (failure.code === '23505' || failure.cause?.code === '23505')
      throw createError({ statusCode: 409, statusMessage: 'Этот аккаунт LINE уже подключён к другой организации' })
    throw error
  }
  return getLineConnection(actor)
}

export async function disconnectLine(actor: Actor) {
  await assertMessagingAccess(actor)
  await db.transaction(async (tx) => {
    const [organization] = await tx.select().from(organizations)
      .where(eq(organizations.id, actor.organizationId)).for('update')
    assertMessagingEnabled(organization)
    const [row] = await tx.select().from(messagingConnections)
      .where(connectionScope(actor.organizationId, 'line'))
    if (!row) return
    await tx.update(messagingConnections)
      .set({ connected: false, verificationPending: false, updatedAt: new Date() })
      .where(eq(messagingConnections.id, row.id))
    await cancelConnectionQueue(tx, actor.organizationId, row.id)
  })
  return getLineConnection(actor)
}
