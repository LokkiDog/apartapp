import { specialServiceInputSchema } from '@contracts/crm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { specialServices } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => { const actor = await requireActor(event); requireRole(actor, 'administrator'); return (await db.insert(specialServices).values({ ...specialServiceInputSchema.parse(await readBody(event)), organizationId: actor.organizationId }).returning())[0] })
