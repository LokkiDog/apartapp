import { z } from 'zod'
import { requireRole, requireActor } from '../../infrastructure/auth/actor'
import { inviteUser } from '../../modules/auth/account.service'
const schema = z.object({ name: z.string().min(2), email: z.string().email(), roles: z.array(z.enum(['administrator', 'manager', 'cleaner', 'specialist'])).length(1), locale: z.enum(['ru', 'en', 'he']).default('ru') })
export default defineEventHandler(async event => {
  const actor = await requireActor(event); requireRole(actor, 'administrator'); const data = schema.parse(await readBody(event))
  return inviteUser({ organizationId: actor.organizationId, ...data })
})
