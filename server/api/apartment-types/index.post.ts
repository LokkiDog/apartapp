import { requireActor } from '../../infrastructure/auth/actor'
import { createApartmentType } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => createApartmentType(await requireActor(event), await readBody(event)))
