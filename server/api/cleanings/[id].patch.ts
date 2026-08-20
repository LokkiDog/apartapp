import { requireActor } from '../../infrastructure/auth/actor'
import { updateCleaning } from '../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => updateCleaning(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
