import { z } from 'zod'
import { conversationLinkSchema } from '../../../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../../../modules/messaging/access'
import { updateConversation } from '../../../../modules/messaging/conversations'
export default defineEventHandler(async (event) =>
  updateConversation(
    await requireMessagingActor(event),
    z.uuid().parse(getRouterParam(event, 'id')),
    conversationLinkSchema.parse(await readBody(event)),
  ),
)
