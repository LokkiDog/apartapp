import { inventoryThresholdSchema } from '@contracts/report'
import { requireActor } from '../../../infrastructure/auth/actor'
import { enableApartmentConsumable } from '../../../modules/inventory/inventory.service'
export default defineEventHandler(async event => enableApartmentConsumable(await requireActor(event), getRouterParam(event, 'id')!, inventoryThresholdSchema.parse(await readBody(event))))
