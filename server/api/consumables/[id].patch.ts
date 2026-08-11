import { requireActor } from '../../infrastructure/auth/actor'
import { updateConsumable } from '../../modules/inventory/inventory.service'

export default defineEventHandler(async event => updateConsumable(
  await requireActor(event),
  getRouterParam(event, 'id')!,
  await readBody(event)
))
