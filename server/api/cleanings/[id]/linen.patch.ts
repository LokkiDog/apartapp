import { requireActor } from '../../../infrastructure/auth/actor'
import { updateCleaningLinen } from '../../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => updateCleaningLinen(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
