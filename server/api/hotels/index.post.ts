import { requireActor } from '../../infrastructure/auth/actor'
import { createHotel } from '../../modules/hotel/hotel.service'
export default defineEventHandler(async event => createHotel(await requireActor(event), await readBody(event)))
