import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { getOwnProfile } from '../../../modules/auth/profile.service'
export default defineEventHandler(async event => getOwnProfile(await requirePrincipal(event)))
