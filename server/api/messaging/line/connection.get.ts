import { requireMessagingActor } from '../../../modules/messaging/access'
import { getLineConnection } from '../../../modules/messaging/line-connection'

export default defineEventHandler(async (event) => getLineConnection(await requireMessagingActor(event)))
