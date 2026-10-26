import { requireActor } from '../../../infrastructure/auth/actor'
import { updateNotificationPreferences } from '../../../infrastructure/notification/preferences'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return updateNotificationPreferences(actor, await readBody(event))
})
