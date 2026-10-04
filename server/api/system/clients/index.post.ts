import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { clientInputSchema } from '../../../../shared/contracts/platform'
import { createClient } from '../../../modules/platform/platform.service'
export default defineEventHandler(async event => createClient(await requireSuperuser(event), clientInputSchema.parse(await readBody(event))))
