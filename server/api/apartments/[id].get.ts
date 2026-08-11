import { requireActor } from '../../infrastructure/auth/actor'
import { getApartment } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => getApartment(await requireActor(event), getRouterParam(event, 'id')!))
