import { eq, sql } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { messagingConversations } from '../../infrastructure/database/schema'
import { requireMessagingActor } from '../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event, { renew: false })
  const [result] = await db.select({
    count: sql<number>`coalesce(sum(${messagingConversations.unread}), 0)`.mapWith(Number),
  }).from(messagingConversations)
    .where(eq(messagingConversations.organizationId, actor.organizationId))

  return { count: result?.count ?? 0 }
})
