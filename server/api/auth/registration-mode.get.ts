import { registrationMode } from '../../modules/auth/registration.service'
export default defineEventHandler(async () => ({ registrationMode: await registrationMode() }))
