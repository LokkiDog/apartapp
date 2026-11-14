import { requireActor } from '../../infrastructure/auth/actor'
import { saveGuest } from '../../modules/guest/guest.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return saveGuest(actor, await readBody(event))
})
