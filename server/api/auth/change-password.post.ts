import { changePasswordSchema } from '@contracts/platform'
import { requirePrincipal } from '../../infrastructure/auth/platform'
import { limitRegistration } from '../../modules/auth/registration.service'
import { changeOwnPassword } from '../../modules/auth/password.service'

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  await limitRegistration(`password-change:${actor.id}`)
  const { currentPassword, newPassword } = changePasswordSchema.parse(await readBody(event))
  return changeOwnPassword(actor, currentPassword, newPassword)
})
