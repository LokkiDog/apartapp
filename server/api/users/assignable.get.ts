import { and, asc, eq } from 'drizzle-orm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { users } from '../../infrastructure/database/schema'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator', 'manager')
  return db.query.users.findMany({
    where: and(eq(users.organizationId, actor.organizationId), eq(users.status, 'active')),
    columns: { id: true, name: true, roles: true },
    orderBy: [asc(users.name)]
  })
})
