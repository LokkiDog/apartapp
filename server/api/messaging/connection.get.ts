import { requireMessagingActor } from '../../modules/messaging/access'
import { getConnection } from '../../modules/messaging/connection'
export default defineEventHandler(async (event) =>
  getConnection(await requireMessagingActor(event)),
)
