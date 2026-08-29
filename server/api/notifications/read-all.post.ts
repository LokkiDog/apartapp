import { and, eq, isNull } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications } from '../../infrastructure/database/schema'
import { publishNotification } from '../../infrastructure/notification/realtime'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const readAt = new Date()
  const updated = await db.update(notifications).set({ readAt }).where(and(
    eq(notifications.userId, actor.id),
    eq(notifications.organizationId, actor.organizationId),
    isNull(notifications.readAt)
  )).returning({ id: notifications.id })
  if (updated.length) publishNotification(actor.id, { type: 'notifications.read-all', readAt: readAt.toISOString() })
  return { ok: true }
})
