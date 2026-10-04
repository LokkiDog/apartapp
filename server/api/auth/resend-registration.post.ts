import { z } from 'zod'
import { emailSchema } from '../../../shared/contracts/platform'
import { resendRegistration, limitRegistration } from '../../modules/auth/registration.service'
export default defineEventHandler(async event => {
  await limitRegistration('ip:' + (getRequestIP(event) ?? 'unknown'))
  const data = z.object({ email: emailSchema }).parse(await readBody(event))
  return resendRegistration(data.email)
})
