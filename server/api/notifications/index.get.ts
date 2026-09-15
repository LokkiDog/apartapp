import { and, desc, eq, lt, or } from 'drizzle-orm'
import { notificationListQuerySchema } from '@contracts/crm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { notifications } from '../../infrastructure/database/schema'
import { localizedNotificationBody, localizedNotificationTitle } from '../../infrastructure/notification/localize'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const query = notificationListQuerySchema.parse(getQuery(event))
  let cursor: { createdAt: Date; id: string } | null = null
  if (query.cursor) {
    const separator = query.cursor.lastIndexOf('|')
    const createdAt = new Date(query.cursor.slice(0, separator))
    const id = query.cursor.slice(separator + 1)
    if (separator < 0 || Number.isNaN(createdAt.getTime()) || !id.match(/^[0-9a-f-]{36}$/i)) throw createError({ statusCode: 400, statusMessage: 'Некорректный курсор' })
    cursor = { createdAt, id }
  }
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.organizationId, actor.organizationId),
      eq(notifications.userId, actor.id),
      cursor ? or(lt(notifications.createdAt, cursor.createdAt), and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id))) : undefined
    ),
    orderBy: [desc(notifications.createdAt), desc(notifications.id)],
    limit: query.paginated ? query.limit + 1 : undefined
  })
  const hasNextPage = query.paginated && rows.length > query.limit
  const page = hasNextPage ? rows.slice(0, query.limit) : rows
  const items = page.map(item => ({ ...item, title: localizedNotificationTitle(item.type, actor.locale, item.title), body: localizedNotificationBody(item.type, actor.locale, item.body) }))
  if (!query.paginated) return items
  const last = page.at(-1)
  return { items, nextCursor: hasNextPage && last ? `${last.createdAt.toISOString()}|${last.id}` : null }
})
