import { requireActor } from '../../../infrastructure/auth/actor'
import { saveGuest } from '../../../modules/guest/guest.service'
import { z } from 'zod'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  return saveGuest(actor, await readBody(event), id)
})
