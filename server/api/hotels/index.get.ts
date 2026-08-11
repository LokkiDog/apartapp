import { requireActor } from '../../infrastructure/auth/actor'
import { listHotels } from '../../modules/hotel/hotel.service'
export default defineEventHandler(async event => listHotels(await requireActor(event)))
