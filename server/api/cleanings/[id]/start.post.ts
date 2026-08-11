import { requireActor } from '../../../infrastructure/auth/actor'
import { startCleaning } from '../../../modules/cleaning/cleaning.service'
export default defineEventHandler(async event => startCleaning(await requireActor(event), getRouterParam(event, 'id')!))
