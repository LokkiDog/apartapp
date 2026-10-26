import { effectiveNotificationChannels, type NotificationEventKey } from '@contracts/notification-preferences'
import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { db } from '../database/client'
import { notifications, pushSubscriptions, users, organizations, notificationPreferences, notificationEmailQueue } from '../database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from './localize'
import { isClientActive } from '../auth/platform'
import { publishNotification } from './realtime'

type AppLocale = 'ru' | 'en' | 'he'
type LocalizedCopy = string | Record<AppLocale, string>

function copyForLocale(copy: LocalizedCopy, locale: AppLocale) {
  return typeof copy === 'string' ? copy : copy[locale]
}

export async function notifyUsers(input: {
  organizationId: string
  userIds: string[]
  type: 'stay_changed' | 'stay_conflict' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published' | 'cleaning_changed' | 'task_resolved' | 'task_returned' | 'manual'
  eventKey: NotificationEventKey
  title: LocalizedCopy
  body: LocalizedCopy
  href: string | null
}) {
  if (!input.userIds.length || !(await isClientActive(input.organizationId))) return 0
  const recipients = await db.select({ id: users.id, locale: users.locale }).from(users).where(and(
    eq(users.organizationId, input.organizationId),
    eq(users.status, 'active'),
    inArray(users.id, [...new Set(input.userIds)])
  ))
  if (!recipients.length) return 0

  const preferences = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.organizationId, input.organizationId), eq(notificationPreferences.eventKey, input.eventKey), inArray(notificationPreferences.userId, recipients.map(recipient => recipient.id))))
  const channels = new Map(recipients.map(recipient => [recipient.id, effectiveNotificationChannels(preferences.find(row => row.userId === recipient.id))]))
  const recipientLocales = new Map(recipients.map(recipient => [recipient.id, recipient.locale]))
  if (!(await isClientActive(input.organizationId))) return 0
  const created = await db.transaction(async tx => {
    const [client] = await tx.select().from(organizations).where(eq(organizations.id, input.organizationId)).for('share')
    if (client?.status !== 'active') return []
    const rows = await tx.insert(notifications).values(recipients.map(recipient => ({
      organizationId: input.organizationId,
      userId: recipient.id,
      type: input.type,
      eventKey: input.eventKey,
      crmVisible: channels.get(recipient.id)!.crm,
      title: copyForLocale(input.title, recipient.locale),
      body: copyForLocale(input.body, recipient.locale),
      href: input.href
    }))).returning()
    const emails = rows.filter(row => channels.get(row.userId)!.email)
    if (emails.length) await tx.insert(notificationEmailQueue).values(emails.map(row => ({ notificationId: row.id }))).onConflictDoNothing()
    return rows
  })
  if (!(await isClientActive(input.organizationId))) return created.length
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
  const subscriptions = await db.select({ subscription: pushSubscriptions, locale: users.locale }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(and(eq(users.organizationId, input.organizationId), inArray(pushSubscriptions.userId, recipients.map(recipient => recipient.id))))
  const notificationByUser = new Map(created.map(notification => [notification.userId, notification]))
  const results = await Promise.allSettled(subscriptions.map(async ({ subscription, locale }) => {
    if (!(await isClientActive(input.organizationId))) return
    const notification = notificationByUser.get(subscription.userId)
    if (!notification || !channels.get(subscription.userId)?.push) return
    return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    }, JSON.stringify({
      id: notification.id,
      title: localizedNotificationTitle(notification.type, locale, notification.title, notification.eventKey),
      body: localizedNotificationBody(notification.type, locale, notification.body),
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

export async function administratorsForOrganization(organizationId: string) {
  const candidates = await db.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.organizationId, organizationId))
  return candidates.filter(user => user.roles.includes('administrator')).map(user => user.id)
}
