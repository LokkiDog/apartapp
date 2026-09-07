import { requireActor } from '../../infrastructure/auth/actor'
import { deleteCleaning } from '../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => deleteCleaning(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event).catch(() => undefined)))
