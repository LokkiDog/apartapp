import { messagePageSchema } from '../../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../../modules/messaging/access'
import { listConversations } from '../../../modules/messaging/conversations'
export default defineEventHandler(async (event) =>
  listConversations(
    await requireMessagingActor(event),
    messagePageSchema.parse(getQuery(event)).before,
  ),
)
