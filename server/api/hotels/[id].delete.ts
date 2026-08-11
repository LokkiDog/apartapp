import { requireActor } from '../../infrastructure/auth/actor'
import { deleteHotel } from '../../modules/hotel/hotel.service'
export default defineEventHandler(async event => deleteHotel(await requireActor(event), getRouterParam(event, 'id')!))
