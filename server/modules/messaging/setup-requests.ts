import type { MessagingSetupRequest } from '@contracts/system-notifications'
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { messagingSetupEvents, type MessagingChannel } from '@contracts/messaging'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications, organizations } from '../../infrastructure/database/schema'
import { activeSystemRecipients, publishSystemNotification } from '../../infrastructure/notification/system'
import { assertMessagingEnabled } from './access'

const eventKeys = Object.values(messagingSetupEvents)

export async function requestMessagingSetup(actor: Actor, channel: MessagingChannel) {
  return db.transaction(async tx => {
    // Serialize submissions for this organization so concurrent clicks share one request.
    const [organization] = await tx.select().from(organizations)
      .where(eq(organizations.id, actor.organizationId)).for('update')
    assertMessagingEnabled(organization)

    const recipients = await activeSystemRecipients(tx)
    if (!recipients.length) throw createError({ statusCode: 503, statusMessage: 'Нет доступного суперадминистратора' })

    const eventKey = messagingSetupEvents[channel]
    const existing = await tx.select({ userId: notifications.userId }).from(notifications).where(and(
      eq(notifications.sourceOrganizationId, actor.organizationId),
      eq(notifications.eventKey, eventKey),
      inArray(notifications.userId, recipients.map(recipient => recipient.id)),
      isNull(notifications.readAt),
    ))
    // An open request is already available in the system inbox.
    if (existing.length) return { alreadyRequested: true }

    const provider = channel === 'line' ? 'LINE' : 'Telegram'
    await publishSystemNotification(tx, recipients, {
      sourceOrganizationId: actor.organizationId,
      eventKey,
      title: `Заявка на подключение ${provider}`,
      body: `${organization!.name} · ${actor.name} (${actor.email})`,
      href: '/system/clients'
    })
    return { alreadyRequested: false }
  })
}

function openSetupRequests(userId: string) {
  return and(
    eq(notifications.userId, userId),
    inArray(notifications.eventKey, eventKeys),
    eq(notifications.crmVisible, false),
    isNotNull(notifications.sourceOrganizationId),
    isNull(notifications.readAt),
  )
}

export async function listMessagingSetupRequests(userId: string): Promise<MessagingSetupRequest[]> {
  return db.select({
    id: notifications.id,
    organizationId: notifications.sourceOrganizationId,
    title: notifications.title,
    body: notifications.body,
  }).from(notifications).where(openSetupRequests(userId))
    .orderBy(desc(notifications.createdAt)).limit(50)
}

export async function acknowledgeMessagingSetupRequest(userId: string, id: string) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(openSetupRequests(userId), eq(notifications.id, id)))
  return { ok: true }
}
