import { requireActor } from '../../../infrastructure/auth/actor'
import { getNotificationPreferences } from '../../../infrastructure/notification/preferences'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return getNotificationPreferences(actor)
})
