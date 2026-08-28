import { and, desc, eq } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications } from '../../infrastructure/database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from '../../infrastructure/notification/localize'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const items = await db.query.notifications.findMany({ where: and(eq(notifications.organizationId, actor.organizationId), eq(notifications.userId, actor.id)), orderBy: [desc(notifications.createdAt)] })
  return items.map(item => ({ ...item, title: localizedNotificationTitle(item.type, actor.locale, item.title), body: localizedNotificationBody(item.type, actor.locale, item.body) }))
})
