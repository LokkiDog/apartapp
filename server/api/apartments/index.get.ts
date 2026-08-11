import { requireActor } from '../../infrastructure/auth/actor'
import { listApartments } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => listApartments(await requireActor(event), getQuery(event).hotelId as string | undefined))
