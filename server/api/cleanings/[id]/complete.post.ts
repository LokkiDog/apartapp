import { requireActor } from '../../../infrastructure/auth/actor'
import { completeCleaning } from '../../../modules/cleaning/cleaning.service'
export default defineEventHandler(async event => completeCleaning(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
