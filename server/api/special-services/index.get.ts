import { and, asc, eq } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { specialServices } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  return db.query.specialServices.findMany({
    where: actor.roles.includes('administrator')
      ? eq(specialServices.organizationId, actor.organizationId)
      : and(eq(specialServices.organizationId, actor.organizationId), eq(specialServices.active, true)),
    orderBy: [asc(specialServices.name)]
  })
})
