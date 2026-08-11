import { requireActor } from '../../infrastructure/auth/actor'
import { updateStay } from '../../modules/stay/stay.service'
export default defineEventHandler(async event => updateStay(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
