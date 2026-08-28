import { z } from 'zod'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { inviteUser } from '../../modules/auth/account.service'
const schema = z.object({ name: z.string().min(2), email: z.string().email(), roles: z.array(z.enum(['administrator', 'manager', 'cleaner'])).min(1), locale: z.enum(['ru', 'en', 'he']).default('ru') })
export default defineEventHandler(async event => { const actor = await requireActor(event); requireRole(actor, 'administrator'); return inviteUser({ organizationId: actor.organizationId, ...schema.parse(await readBody(event)) }) })
