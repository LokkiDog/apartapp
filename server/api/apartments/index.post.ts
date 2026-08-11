import { requireActor } from '../../infrastructure/auth/actor'
import { createApartment } from '../../modules/apartment/apartment.service'
export default defineEventHandler(async event => createApartment(await requireActor(event), await readBody(event)))
