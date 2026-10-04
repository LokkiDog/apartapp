import { registrationInputSchema } from '../../../shared/contracts/platform'
import { registerCompany, limitRegistration } from '../../modules/auth/registration.service'
export default defineEventHandler(async event => {
  await limitRegistration('ip:' + (getRequestIP(event) ?? 'unknown'))
  const data = registrationInputSchema.parse(await readBody(event))
  return registerCompany(data)
})
