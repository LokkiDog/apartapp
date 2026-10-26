import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { getReleaseAnnouncementState } from '../../../modules/auth/release-announcement.service'
export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  return getReleaseAnnouncementState(actor)
})
