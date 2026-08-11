import { z } from 'zod'
import { requireActor } from '../../infrastructure/auth/actor'
import { createConsumable } from '../../modules/inventory/inventory.service'
const schema = z.object({ name: z.string().min(1), category: z.string().min(1), unit: z.string().min(1) })
export default defineEventHandler(async event => createConsumable(await requireActor(event), schema.parse(await readBody(event))))
