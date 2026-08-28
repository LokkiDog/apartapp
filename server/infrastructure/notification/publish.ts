import { eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { db } from '../database/client'
import { notifications, pushSubscriptions, users } from '../database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from './localize'

export async function notifyUsers(input: {
  organizationId: string
  userIds: string[]
  type: 'stay_changed' | 'work_assigned' | 'work_rescheduled' | 'work_canceled' | 'problem' | 'manager_expense_report_published'
  title: string
  body: string
  href: string
}) {
  if (!input.userIds.length) return
  await db.insert(notifications).values(input.userIds.map(userId => ({ ...input, userId })))

  const config = useRuntimeConfig()
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) return

  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  const subscriptions = await db.select({ subscription: pushSubscriptions, locale: users.locale }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(inArray(pushSubscriptions.userId, input.userIds))
  await Promise.allSettled(subscriptions.map(({ subscription, locale }) => webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }, JSON.stringify({ title: localizedNotificationTitle(input.type, locale, input.title), body: localizedNotificationBody(input.type, locale, input.body), href: input.href }))))
}

export async function administratorsForOrganization(organizationId: string) {
  const candidates = await db.select({ id: users.id, roles: users.roles }).from(users).where(eq(users.organizationId, organizationId))
  return candidates.filter(user => user.roles.includes('administrator')).map(user => user.id)
}
