import { systemEmailUpdateSchema } from '@contracts/system-notifications'
import { requireSuperuser } from '../../infrastructure/auth/platform'
import { setSystemEmailPreference } from '../../infrastructure/notification/system'

export default defineEventHandler(async event => {
  const actor = await requireSuperuser(event)
  const { category, enabled } = await readValidatedBody(event, systemEmailUpdateSchema.parse)
  return setSystemEmailPreference(actor.id, category, enabled)
})
