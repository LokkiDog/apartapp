import { z } from 'zod'
import { requireActor } from '../../../../infrastructure/auth/actor'
import { assignConversationGuest } from '../../../../modules/guest/guest.service'

export default defineEventHandler(async event =>
  assignConversationGuest(
    await requireActor(event),
    z.uuid().parse(getRouterParam(event, 'id')),
    await readBody(event),
  ),
)
