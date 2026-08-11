import { requireActor } from '../../../infrastructure/auth/actor'
import { overrideCleaningTariff } from '../../../modules/cleaning/cleaning.service'
export default defineEventHandler(async event => overrideCleaningTariff(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
