import { requireActor } from '../../../infrastructure/auth/actor'
import { archiveHotel } from '../../../modules/hotel/hotel.service'

export default defineEventHandler(async event => archiveHotel(await requireActor(event), getRouterParam(event, 'id')!))
