import { requireActor } from '../../infrastructure/auth/actor'
import { useStock } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => { const body = await readBody<{ apartmentId: string }>(event); return useStock(await requireActor(event), body.apartmentId, body) })
