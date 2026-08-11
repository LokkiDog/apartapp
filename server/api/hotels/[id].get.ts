import { requireActor } from '../../infrastructure/auth/actor'
import { getHotel } from '../../modules/hotel/hotel.service'
export default defineEventHandler(async event => getHotel(await requireActor(event), getRouterParam(event, 'id')!))
