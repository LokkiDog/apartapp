import { and, eq } from 'drizzle-orm'
import { specialServiceInputSchema } from '@contracts/crm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { specialServices } from '../../infrastructure/database/schema'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const data = specialServiceInputSchema.parse(await readBody(event))
  const [service] = await db.update(specialServices).set({ ...data, updatedAt: new Date() })
    .where(and(eq(specialServices.id, getRouterParam(event, 'id')!), eq(specialServices.organizationId, actor.organizationId))).returning()
  if (!service) throw createError({ statusCode: 404, statusMessage: 'Услуга не найдена' })
  return service
})
