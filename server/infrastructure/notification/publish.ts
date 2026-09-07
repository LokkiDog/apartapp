import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { db } from '../database/client'
import { notifications, pushSubscriptions, users } from '../database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from './localize'
import { publishNotification } from './realtime'

type AppLocale = 'ru' | 'en' | 'he'
type LocalizedCopy = string | Record<AppLocale, string>

function copyForLocale(copy: LocalizedCopy, locale: AppLocale) {
  return typeof copy === 'string' ? copy : copy[locale]
}

export async function notifyUsers(input: {
  organizationId: string
  userIds: string[]
  type: 'stay_changed' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published' | 'cleaning_changed'
  title: LocalizedCopy
  body: LocalizedCopy
  href: string | null
}) {
  if (!input.userIds.length) return
  const recipients = await db.select({ id: users.id, locale: users.locale }).from(users).where(and(
    eq(users.organizationId, input.organizationId),
    eq(users.status, 'active'),
    inArray(users.id, [...new Set(input.userIds)])
  ))
  if (!recipients.length) return

  const recipientLocales = new Map(recipients.map(recipient => [recipient.id, recipient.locale]))
  const created = await db.insert(notifications).values(recipients.map(recipient => ({
    organizationId: input.organizationId,
    userId: recipient.id,
    type: input.type,
    title: copyForLocale(input.title, recipient.locale),
    body: copyForLocale(input.body, recipient.locale),
    href: input.href
  }))).returning()
  for (const notification of created) {
    const locale = recipientLocales.get(notification.userId) ?? 'ru'
    publishNotification(notification.userId, {
      type: 'notification.created',
      notification: {
        ...notification,
        title: localizedNotificationTitle(notification.type, locale, notification.title),
        body: localizedNotificationBody(notification.type, locale, notification.body),
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString()
      }
    })
  }

  const config = useRuntimeConfig()
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) return

  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  const subscriptions = await db.select({ subscription: pushSubscriptions, locale: users.locale }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(and(eq(users.organizationId, input.organizationId), inArray(pushSubscriptions.userId, recipients.map(recipient => recipient.id))))
  const notificationByUser = new Map(created.map(notification => [notification.userId, notification]))
  const results = await Promise.allSettled(subscriptions.map(({ subscription, locale }) => {
    const notification = notificationByUser.get(subscription.userId)
    if (!notification) return Promise.resolve()
    return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    }, JSON.stringify({
      id: notification.id,
      title: localizedNotificationTitle(notification.type, locale, notification.title),
      body: localizedNotificationBody(notification.type, locale, notification.body),
      href: notification.href,
      timestamp: notification.createdAt.toISOString()
    }))
  }))
  await Promise.all(results.map((result, index) => {
    if (result.status !== 'rejected') return undefined
    const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode
    if (statusCode !== 404 && statusCode !== 410) return undefined
    return db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptions[index]!.subscription.id))
  }))
}

export async function administratorsForOrganization(organizationId: string) {
  const candidates = await db.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.organizationId, organizationId))
  return candidates.filter(user => user.roles.includes('administrator')).map(user => user.id)
}
