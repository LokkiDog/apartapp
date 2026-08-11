import { requireActor } from '../../infrastructure/auth/actor'
import { replenishStock } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => { const body = await readBody<{ apartmentId: string }>(event); return replenishStock(await requireActor(event), body.apartmentId, body) })
