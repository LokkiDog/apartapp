import { and, desc, eq } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => { const actor = await requireActor(event); return db.query.notifications.findMany({ where: and(eq(notifications.organizationId, actor.organizationId), eq(notifications.userId, actor.id)), orderBy: [desc(notifications.createdAt)] }) })
