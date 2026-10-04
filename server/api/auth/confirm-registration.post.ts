import { confirmationSchema } from '../../../shared/contracts/platform'
import { confirmRegistration, limitRegistration } from '../../modules/auth/registration.service'
export default defineEventHandler(async event => {
  await limitRegistration('ip:' + (getRequestIP(event) ?? 'unknown'))
  const data = confirmationSchema.parse(await readBody(event))
  return confirmRegistration(data.token)
})
