import { effectiveNotificationChannels, type NotificationEventKey } from '@contracts/notification-preferences'
import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { db } from '../database/client'
import { notifications, pushSubscriptions, users, organizations, notificationPreferences, notificationEmailQueue } from '../database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from './localize'
import { isClientActive } from '../auth/platform'
import { publishNotification } from './realtime'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type AppLocale = 'ru' | 'en' | 'he'
type LocalizedCopy = string | Record<AppLocale, string>

function copyForLocale(copy: LocalizedCopy, locale: AppLocale) {
  return typeof copy === 'string' ? copy : copy[locale]
}

type NotificationInput = {
  organizationId: string
  userIds: string[]
  type: typeof notifications.$inferSelect.type
  eventKey: NotificationEventKey
  title: LocalizedCopy
  body: LocalizedCopy
  href: string | null
}

export async function notifyUsers(input: NotificationInput) {
  if (!input.userIds.length) return 0
  const batch = await db.transaction(tx => saveNotifications(tx, input))
  return deliverNotifications(input.organizationId, batch)
}

export async function saveNotifications(tx: Transaction, input: NotificationInput | (Omit<NotificationInput, 'userIds' | 'type'> & {
  type: 'guest_message'
  userIds?: never
})) {
  const [client] = await tx.select().from(organizations)
    .where(eq(organizations.id, input.organizationId)).for('share')
  if (client?.status !== 'active' || (input.type === 'guest_message' && !client.messagingEnabled)) return

  const candidates = await tx.select({ id: users.id, locale: users.locale, roles: users.roles })
    .from(users).where(and(
      eq(users.organizationId, input.organizationId),
      eq(users.status, 'active'),
      input.userIds ? inArray(users.id, [...new Set(input.userIds)]) : undefined,
    ))
  const recipients = input.type === 'guest_message'
    ? candidates.filter(user => user.roles.includes('administrator'))
    : candidates
  if (!recipients.length) return

  const preferences = await tx.select().from(notificationPreferences).where(and(
    eq(notificationPreferences.organizationId, input.organizationId),
    eq(notificationPreferences.eventKey, input.eventKey),
    inArray(notificationPreferences.userId, recipients.map(recipient => recipient.id)),
  ))
  const channels = new Map(recipients.map(recipient => [
    recipient.id, effectiveNotificationChannels(preferences.find(row => row.userId === recipient.id)),
  ]))
  const created = await tx.insert(notifications).values(recipients.map(recipient => ({
    organizationId: input.organizationId,
    userId: recipient.id,
    type: input.type,
    eventKey: input.eventKey,
    crmVisible: channels.get(recipient.id)!.crm,
    title: copyForLocale(input.title, recipient.locale),
    body: copyForLocale(input.body, recipient.locale),
    href: input.href,
  }))).returning()
  const emails = created.filter(row => channels.get(row.userId)!.email)
  if (emails.length)
    await tx.insert(notificationEmailQueue).values(emails.map(row => ({ notificationId: row.id }))).onConflictDoNothing()
  return { created, channels, recipients }
}

export async function deliverNotifications(
  organizationId: string,
  batch: Awaited<ReturnType<typeof saveNotifications>>,
) {
  if (!batch) return 0
  const { created, channels, recipients } = batch
  if (!(await isClientActive(organizationId))) return created.length
  const recipientLocales = new Map(recipients.map(recipient => [recipient.id, recipient.locale]))
  for (const notification of created) {
    if (!notification.crmVisible) continue
    const locale = recipientLocales.get(notification.userId) ?? 'ru'
    publishNotification(notification.userId, {
      type: 'notification.created',
      notification: {
        ...notification,
        title: localizedNotificationTitle(notification.type, locale, notification.title, notification.eventKey),
        body: localizedNotificationBody(notification.type, locale, notification.body),
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString()
      }
    })
  }

  const config = useRuntimeConfig()
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) return created.length

  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  const subscriptions = await db.select({ subscription: pushSubscriptions, locale: users.locale }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(and(eq(users.organizationId, organizationId), inArray(pushSubscriptions.userId, recipients.map(recipient => recipient.id))))
  const notificationByUser = new Map(created.map(notification => [notification.userId, notification]))
  const results = await Promise.allSettled(subscriptions.map(async ({ subscription, locale }) => {
    if (!(await isClientActive(organizationId))) return
    const notification = notificationByUser.get(subscription.userId)
    if (!notification || !channels.get(subscription.userId)?.push) return
    return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    }, JSON.stringify({
      id: notification.id,
      icon: config.public.brand.icon192,
      title: localizedNotificationTitle(notification.type, locale, notification.title, notification.eventKey),
      body: notification.type === 'guest_message'
        ? pushMessagePreview(notification.body)
        : localizedNotificationBody(notification.type, locale, notification.body),
      href: notification.href ?? '/notifications',
      timestamp: notification.createdAt.toISOString()
    }))
  }))
  await Promise.all(results.map((result, index) => {
    if (result.status !== 'rejected') return undefined
    const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode
    if (statusCode !== 404 && statusCode !== 410) return undefined
    return db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptions[index]!.subscription.id))
  }))
  return created.length
}

function pushMessagePreview(body: string) {
  const characters = Array.from(body)
  // Keep the encrypted payload under the Web Push size limit even for emoji.
  return characters.length > 500 ? `${characters.slice(0, 500).join('')}…` : body
}

export async function administratorsForOrganization(organizationId: string) {
  const candidates = await db.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.organizationId, organizationId))
  return candidates.filter(user => user.roles.includes('administrator')).map(user => user.id)
}
