import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { setOwnProfilePhoto } from '../../../modules/auth/profile.service'
export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  setHeader(event, 'cache-control', 'no-store')
  return setOwnProfilePhoto(actor, null)
})
