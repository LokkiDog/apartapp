import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { updateOwnProfile } from '../../../modules/auth/profile.service'

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  const result = await updateOwnProfile(actor, await readBody(event))
  await requirePrincipal(event)
  return result
})
