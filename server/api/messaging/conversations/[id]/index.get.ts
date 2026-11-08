import { z } from 'zod'
import { messagePageSchema } from '../../../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../../../modules/messaging/access'
import { listMessages } from '../../../../modules/messaging/conversations'
export default defineEventHandler(async (event) =>
  listMessages(
    await requireMessagingActor(event),
    z.uuid().parse(getRouterParam(event, 'id')),
    messagePageSchema.parse(getQuery(event)).before,
    messagePageSchema.parse(getQuery(event)).limit,
  ),
)
