import { requireActor } from '../../../infrastructure/auth/actor'
import { assignCleaners } from '../../../modules/cleaning/cleaning.service'
export default defineEventHandler(async event => assignCleaners(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
