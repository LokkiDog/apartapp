import { requireActor } from '../../infrastructure/auth/actor'
import { listConsumables } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => listConsumables(await requireActor(event)))
