import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { listMessagingSetupRequests } from '../../../modules/messaging/setup-requests'

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  return listMessagingSetupRequests(actor.id)
})
