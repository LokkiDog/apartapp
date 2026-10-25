import { z } from 'zod'
import { passkeyRegistrationOptions, passkeyOrigin } from '../../../modules/auth/passkey.service'
import { limitRegistration } from '../../../modules/auth/registration.service'
import { requirePrincipal } from '../../../infrastructure/auth/platform'
export default defineEventHandler(async event => {
  passkeyOrigin(event)
  const actor = await requirePrincipal(event)
  await limitRegistration(`passkey-enroll:${actor.id}`)
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(await readBody(event))
  return passkeyRegistrationOptions(event, password)
})
