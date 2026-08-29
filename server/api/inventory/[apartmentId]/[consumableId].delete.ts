import { requireActor } from '../../../infrastructure/auth/actor'
import { deleteApartmentStock } from '../../../modules/inventory/inventory.service'

export default defineEventHandler(async event => deleteApartmentStock(
  await requireActor(event),
  getRouterParam(event, 'apartmentId')!,
  getRouterParam(event, 'consumableId')!
))
