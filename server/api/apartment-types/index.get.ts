import { requireActor } from '../../infrastructure/auth/actor'
import { listApartmentTypes } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => listApartmentTypes(await requireActor(event)))
