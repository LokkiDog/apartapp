import { and, eq } from 'drizzle-orm'
import { requireActor } from '../../../infrastructure/auth/actor'
import { db } from '../../../infrastructure/database/client'
import { notifications } from '../../../infrastructure/database/schema'
import { publishNotification } from '../../../infrastructure/notification/realtime'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const [updated] = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, getRouterParam(event, 'id')!), eq(notifications.userId, actor.id), eq(notifications.organizationId, actor.organizationId))).returning({ id: notifications.id, readAt: notifications.readAt })
  if (updated?.readAt) publishNotification(actor.id, { type: 'notification.read', id: updated.id, readAt: updated.readAt.toISOString() })
  return { ok: true }
})
