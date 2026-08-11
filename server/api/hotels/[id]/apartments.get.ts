import { requireActor } from '../../../infrastructure/auth/actor'
import { listHotelApartments } from '../../../modules/hotel/hotel.service'
export default defineEventHandler(async event => listHotelApartments(await requireActor(event), getRouterParam(event, 'id')!))
