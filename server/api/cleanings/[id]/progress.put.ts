import { requireActor } from '../../../infrastructure/auth/actor'
import { saveCleaningProgress } from '../../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => saveCleaningProgress(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
