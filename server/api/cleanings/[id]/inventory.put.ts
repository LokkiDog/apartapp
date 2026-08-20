import { updateCleaningInventory } from '../../../modules/inventory/inventory.service'
import { requireActor } from '../../../infrastructure/auth/actor'

export default defineEventHandler(async event => updateCleaningInventory(await requireActor(event), getRouterParam(event, 'id')!, await readBody(event)))
