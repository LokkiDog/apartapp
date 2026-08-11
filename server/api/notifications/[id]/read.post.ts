import { and, eq } from 'drizzle-orm'
import { requireActor } from '../../../infrastructure/auth/actor'
import { db } from '../../../infrastructure/database/client'
import { notifications } from '../../../infrastructure/database/schema'
export default defineEventHandler(async event => { const actor = await requireActor(event); await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, getRouterParam(event, 'id')!), eq(notifications.userId, actor.id), eq(notifications.organizationId, actor.organizationId))); return { ok: true } })
