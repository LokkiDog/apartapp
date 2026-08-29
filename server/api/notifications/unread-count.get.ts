import { and, eq, isNull, sql } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications } from '../../infrastructure/database/schema'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(
    eq(notifications.organizationId, actor.organizationId),
    eq(notifications.userId, actor.id),
    isNull(notifications.readAt)
  ))
  return { count: result?.count ?? 0 }
})
