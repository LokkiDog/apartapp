import { requireActor } from '../../infrastructure/auth/actor'
import { deleteConsumable } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => deleteConsumable(await requireActor(event), getRouterParam(event, 'id')!))
