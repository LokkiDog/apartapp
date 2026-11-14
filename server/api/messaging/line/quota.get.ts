import { requireActor } from '../../../infrastructure/auth/actor'
import { getConnectedLineQuota } from '../../../modules/messaging/line-connection'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return getConnectedLineQuota(await requireActor(event))
})
