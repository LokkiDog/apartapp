import { requireActor } from '../../infrastructure/auth/actor'
import { findGuestConversations } from '../../modules/guest/guest.service'
import { guestConversationListQuerySchema } from '@contracts/guests'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const query = guestConversationListQuerySchema.parse(getQuery(event))
  return findGuestConversations(actor, query.q, query.page, query.channel)
})
