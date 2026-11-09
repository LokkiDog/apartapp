import { requireMessagingActor } from '../../../modules/messaging/access'
import { disconnectLine } from '../../../modules/messaging/line-connection'

export default defineEventHandler(async (event) => disconnectLine(await requireMessagingActor(event)))
