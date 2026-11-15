import { messagingUnreadCount } from '../../infrastructure/notification/unread-count'
import { requireMessagingActor } from '../../modules/messaging/access'

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event, { renew: false })
  return { count: await messagingUnreadCount(actor.organizationId) }
})
