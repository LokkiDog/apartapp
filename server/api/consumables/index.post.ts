import { consumableInputSchema } from '@contracts/crm'
import { requireActor } from '../../infrastructure/auth/actor'
import { createConsumable } from '../../modules/inventory/inventory.service'
export default defineEventHandler(async event => createConsumable(await requireActor(event), consumableInputSchema.parse(await readBody(event))))
