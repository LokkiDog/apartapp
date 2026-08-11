import { requireActor } from '../../infrastructure/auth/actor'
import { updateApartment } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => updateApartment(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
