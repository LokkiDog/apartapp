import { z } from 'zod'
import { requirePrincipal } from '../../../../infrastructure/auth/platform'
import { confirmEmailChange } from '../../../../modules/auth/email-change.service'
import { limitRegistration } from '../../../../modules/auth/registration.service'

const schema = z.strictObject({ code: z.string().regex(/^\d{6}$/) })

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  const { code } = schema.parse(await readBody(event))
  await limitRegistration(`email-change-confirm:${actor.id}`)
  const result = await confirmEmailChange(actor, code)
  await requirePrincipal(event)
  return result
})
