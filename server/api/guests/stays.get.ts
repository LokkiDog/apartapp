import { requireActor } from '../../infrastructure/auth/actor'
import { findGuestStays } from '../../modules/guest/guest.service'
import { guestListQuerySchema } from '@contracts/guests'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const query = guestListQuerySchema.parse(getQuery(event))
  return findGuestStays(actor, query.q, query.page)
})
