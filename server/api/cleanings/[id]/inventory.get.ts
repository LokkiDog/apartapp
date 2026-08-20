import { inventoryForCleaning } from '../../../modules/inventory/inventory.service'
import { requireActor } from '../../../infrastructure/auth/actor'

export default defineEventHandler(async event => inventoryForCleaning(await requireActor(event), getRouterParam(event, 'id')!))
