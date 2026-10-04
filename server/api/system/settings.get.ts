import { requireSuperuser } from '../../infrastructure/auth/platform'
import { registrationMode } from '../../modules/auth/registration.service'
export default defineEventHandler(async event => { await requireSuperuser(event); return { registrationMode: await registrationMode() } })
