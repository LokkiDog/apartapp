import { requireActor } from '../../../infrastructure/auth/actor'
import { archiveApartment } from '../../../modules/apartment/apartment.service'

export default defineEventHandler(async event => archiveApartment(await requireActor(event), getRouterParam(event, 'id')!))
