import { requireActor } from '../../infrastructure/auth/actor'
import { deleteApartment } from '../../modules/apartment/apartment.service'

export default defineEventHandler(async event => deleteApartment(await requireActor(event), getRouterParam(event, 'id')!))
