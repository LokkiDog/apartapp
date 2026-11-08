import { z } from 'zod'
import { requireMessagingActor } from '../../../../modules/messaging/access'
import { updateConversation } from '../../../../modules/messaging/conversations'
export default defineEventHandler(async (event) =>
  updateConversation(
    await requireMessagingActor(event),
    z.uuid().parse(getRouterParam(event, 'id')),
    {
      read: true,
      ...z
        .object({ through: z.uuid().optional() })
        .strict()
        .parse(await readBody(event)),
    },
  ),
)
