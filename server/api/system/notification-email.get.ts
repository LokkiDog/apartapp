import { requireSuperuser } from '../../infrastructure/auth/platform'
import { getSystemEmailPreferences } from '../../infrastructure/notification/system'

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  return getSystemEmailPreferences(actor.id)
})
