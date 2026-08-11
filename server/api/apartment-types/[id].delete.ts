import { requireActor } from '../../infrastructure/auth/actor'
import { deleteApartmentType } from '../../modules/apartment/apartment.service'

export default defineEventHandler(async event => deleteApartmentType(await requireActor(event), getRouterParam(event, 'id')!))
