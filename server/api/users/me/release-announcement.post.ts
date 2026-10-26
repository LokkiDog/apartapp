import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { markReleaseAnnouncementSeen } from '../../../modules/auth/release-announcement.service'
export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  return markReleaseAnnouncementSeen(actor, await readBody(event))
})
