import { requireActor } from '../../../infrastructure/auth/actor'
import { linkGuestStay } from '../../../modules/guest/guest.service'
import { guestLinkSchema } from '@contracts/guests'
import { z } from 'zod'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const input = guestLinkSchema.parse(await readBody(event))
  return linkGuestStay(actor, id, input.id, input.linked)
})
