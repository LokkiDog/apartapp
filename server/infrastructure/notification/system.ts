import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { systemEmailCategory, systemEmailDefaults, systemNotificationKeys, type SystemEmailCategory } from '@contracts/system-notifications'
import { db } from '../database/client'
import { notificationEmailQueue, notifications, organizations, systemNotificationEmailPreferences, users } from '../database/schema'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function activeSystemRecipients(tx: Transaction) {
  return tx.select({ id: users.id, organizationId: users.organizationId }).from(users)
    .where(and(eq(users.isSuperuser, true), eq(users.status, 'active')))
}

export async function publishSystemNotification(
  tx: Transaction,
  recipients: Awaited<ReturnType<typeof activeSystemRecipients>>,
  event: { eventKey: string; sourceOrganizationId: string; title: string; body: string; href?: string }
) {
  if (!recipients.length) return
  const category = systemEmailCategory(event.eventKey)
  if (!category) throw new Error('Unknown system notification event')

  const preferences = await tx.select().from(systemNotificationEmailPreferences).where(and(
    eq(systemNotificationEmailPreferences.category, category),
    inArray(systemNotificationEmailPreferences.userId, recipients.map(recipient => recipient.id))
  ))
  const enabled = new Map(preferences.map(row => [row.userId, row.enabled]))
  const rows = await tx.insert(notifications).values(recipients.map(recipient => ({
    ...event,
    href: event.href ?? '/system/notifications',
    organizationId: recipient.organizationId,
    userId: recipient.id,
    type: 'manual' as const,
    crmVisible: false
  }))).returning({ id: notifications.id, userId: notifications.userId })
  const jobs = rows.filter(row => enabled.get(row.userId) ?? systemEmailDefaults[category])
    .map(row => ({ notificationId: row.id }))
  if (jobs.length) await tx.insert(notificationEmailQueue).values(jobs)
}

function personalNotifications(userId: string) {
  return and(eq(notifications.userId, userId), eq(notifications.crmVisible, false), inArray(notifications.eventKey, systemNotificationKeys))
}

export async function listSystemNotifications(userId: string, cursor?: string) {
  const scope = personalNotifications(userId)
  const boundary = cursor ? db.select({ createdAt: notifications.createdAt, id: notifications.id })
    .from(notifications).where(and(scope, eq(notifications.id, cursor))) : null
  const rows = await db.select({
    id: notifications.id,
    organizationId: notifications.sourceOrganizationId,
    company: organizations.name,
    title: notifications.title,
    body: notifications.body,
    createdAt: notifications.createdAt,
    readAt: notifications.readAt
  }).from(notifications).leftJoin(organizations, eq(organizations.id, notifications.sourceOrganizationId))
    .where(and(scope, boundary ? sql`(${notifications.createdAt}, ${notifications.id}) < (${boundary})` : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(31)
  const items = rows.slice(0, 30)
  return { items, nextCursor: rows.length > 30 ? items[29]!.id : null }
}

export async function countUnreadSystemNotifications(userId: string) {
  const [row] = await db.select({ count: count() }).from(notifications)
    .where(and(personalNotifications(userId), isNull(notifications.readAt)))
  return row?.count ?? 0
}

export async function readSystemNotification(userId: string, id: string) {
  const [row] = await db.update(notifications).set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(personalNotifications(userId), eq(notifications.id, id))).returning({ readAt: notifications.readAt })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Уведомление не найдено' })
  return row
}

export async function getSystemEmailPreferences(userId: string) {
  const rows = await db.select().from(systemNotificationEmailPreferences).where(eq(systemNotificationEmailPreferences.userId, userId))
  const preferences = { ...systemEmailDefaults }
  for (const row of rows) preferences[row.category] = row.enabled
  return preferences
}

export async function setSystemEmailPreference(userId: string, category: SystemEmailCategory, enabled: boolean) {
  await db.insert(systemNotificationEmailPreferences).values({ userId, category, enabled }).onConflictDoUpdate({
    target: [systemNotificationEmailPreferences.userId, systemNotificationEmailPreferences.category],
    set: { enabled }
  })
  return { category, enabled }
}
