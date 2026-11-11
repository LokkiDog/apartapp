import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { countUnreadSystemNotifications } from '../../../infrastructure/notification/system'

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  return { count: await countUnreadSystemNotifications(actor.id) }
})
