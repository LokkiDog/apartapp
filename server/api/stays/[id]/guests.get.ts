import { requireActor } from '../../../infrastructure/auth/actor'
import { listStayGuests } from '../../../modules/guest/guest.service'
import { z } from 'zod'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return listStayGuests(actor, z.uuid().parse(getRouterParam(event, 'id')))
})
