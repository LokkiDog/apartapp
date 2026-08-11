import { requireActor } from '../../infrastructure/auth/actor'
import { inventoryForApartment } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => inventoryForApartment(await requireActor(event), getRouterParam(event, 'apartmentId')!))
