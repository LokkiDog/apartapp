import { requireMessagingActor } from '../../modules/messaging/access'
import { disconnectTelegram } from '../../modules/messaging/connection'
export default defineEventHandler(async (event) =>
  disconnectTelegram(await requireMessagingActor(event)),
)
