import { z } from 'zod'
import { emailSchema } from '@contracts/platform'
import { requirePrincipal } from '../../../../infrastructure/auth/platform'
import { sendEmailChangeCode } from '../../../../modules/auth/email-change.service'
import { limitRegistration } from '../../../../modules/auth/registration.service'

const schema = z.union([
  z.strictObject({ email: emailSchema, currentPassword: z.string().min(1).max(1024) }),
  z.strictObject({ resend: z.literal(true) })
])

export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  const input = schema.parse(await readBody(event))
  await limitRegistration(`email-change-send:${actor.id}`)
  return sendEmailChangeCode(actor, 'resend' in input ? {} : input)
})
