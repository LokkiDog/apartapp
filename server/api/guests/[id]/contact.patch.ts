import { requireActor } from '../../../infrastructure/auth/actor'
import { linkGuestContact } from '../../../modules/guest/guest.service'
import { guestLinkSchema } from '@contracts/guests'
import { z } from 'zod'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const input = guestLinkSchema.parse(await readBody(event))
  return linkGuestContact(actor, id, input.id, input.linked)
})
