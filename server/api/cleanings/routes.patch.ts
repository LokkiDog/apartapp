import { requireActor } from '../../infrastructure/auth/actor'
import { reorderCleaningRoute } from '../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => reorderCleaningRoute(await requireActor(event), await readBody(event)))
