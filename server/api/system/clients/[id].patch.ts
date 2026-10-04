import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { clientUpdateSchema } from '../../../../shared/contracts/platform'
import { updateClient } from '../../../modules/platform/platform.service'
export default defineEventHandler(async event => updateClient(await requireSuperuser(event), getRouterParam(event, 'id')!, clientUpdateSchema.parse(await readBody(event))))
