import { requireActor } from '../../infrastructure/auth/actor'
import { updateApartmentType } from '../../modules/apartment/apartment.service'

export default defineEventHandler(async event => updateApartmentType(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
