import { requireActor } from '../../infrastructure/auth/actor'
import { updateHotel } from '../../modules/hotel/hotel.service'
export default defineEventHandler(async event => updateHotel(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
