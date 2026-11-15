import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../database/client'
import { messagingConversations, notifications } from '../database/schema'

export async function notificationUnreadCount(organizationId: string, userId: string) {
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(
    eq(notifications.organizationId, organizationId),
    eq(notifications.crmVisible, true),
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
  ))
  return result?.count ?? 0
}

export async function messagingUnreadCount(organizationId: string) {
  const [result] = await db.select({
    count: sql<number>`coalesce(sum(${messagingConversations.unread}), 0)`.mapWith(Number),
  }).from(messagingConversations).where(eq(messagingConversations.organizationId, organizationId))
  return result?.count ?? 0
}
