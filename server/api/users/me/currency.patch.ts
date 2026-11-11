import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { refreshUserSession } from '../../../infrastructure/auth/session'
import { updateOwnCurrency } from '../../../modules/auth/profile.service'

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  const result = await updateOwnCurrency(actor, await readBody(event))
  await refreshUserSession(event, { ...actor, currency: result.currency })
  return result
})
