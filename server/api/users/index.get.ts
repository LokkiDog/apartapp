import { eq } from 'drizzle-orm'
import { requireRole, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const actor = await requireActor(event); requireRole(actor, 'administrator')
  return db.query.users.findMany({ where: eq(users.organizationId, actor.organizationId), columns: { passwordHash: false }, orderBy: (users, { asc }) => [asc(users.name)] })
})
