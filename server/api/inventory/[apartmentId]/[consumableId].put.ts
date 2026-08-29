import { requireActor } from '../../../infrastructure/auth/actor'
import { updateStock } from '../../../modules/inventory/inventory.service'

export default defineEventHandler(async event => updateStock(
  await requireActor(event),
  getRouterParam(event, 'apartmentId')!,
  getRouterParam(event, 'consumableId')!,
  await readBody(event)
))
