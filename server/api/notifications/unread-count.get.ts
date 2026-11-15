import { requireActor } from '../../infrastructure/auth/actor'
import { notificationUnreadCount } from '../../infrastructure/notification/unread-count'

export default defineEventHandler(async event => {
  const actor = await requireActor(event, { renew: false })
  return { count: await notificationUnreadCount(actor.organizationId, actor.id) }
})
