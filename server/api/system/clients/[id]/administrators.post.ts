import { requireSuperuser } from '../../../../infrastructure/auth/platform'
import { administratorInputSchema } from '../../../../../shared/contracts/platform'
import { inviteClientAdministrator } from '../../../../modules/platform/platform.service'
export default defineEventHandler(async event => inviteClientAdministrator(await requireSuperuser(event), getRouterParam(event, 'id')!, administratorInputSchema.parse(await readBody(event))))
