import { z } from 'zod'
import { registrationModeSchema } from '../../../shared/contracts/platform'
import { requireSuperuser } from '../../infrastructure/auth/platform'
import { setRegistrationMode } from '../../modules/platform/platform.service'
export default defineEventHandler(async event => setRegistrationMode(await requireSuperuser(event), z.object({ registrationMode: registrationModeSchema }).parse(await readBody(event)).registrationMode))
