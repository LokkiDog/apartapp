import { and, eq, inArray } from 'drizzle-orm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { financialEntries, specialServices, stayServices } from '../../infrastructure/database/schema'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const serviceId = getRouterParam(event, 'id')!
  const service = await db.query.specialServices.findFirst({ where: and(eq(specialServices.id, serviceId), eq(specialServices.organizationId, actor.organizationId)) })
  if (!service) throw createError({ statusCode: 404, statusMessage: 'Услуга не найдена' })

  const deleted = await db.transaction(async tx => {
    const selections = await tx.select({ id: stayServices.id }).from(stayServices).where(eq(stayServices.specialServiceId, serviceId))
    if (selections.length) await tx.delete(financialEntries).where(and(eq(financialEntries.sourceType, 'stay_service'), inArray(financialEntries.sourceId, selections.map(item => item.id))))
    if (selections.length) await tx.delete(stayServices).where(inArray(stayServices.id, selections.map(item => item.id)))
    await tx.delete(specialServices).where(eq(specialServices.id, serviceId))
    return { service: 1, stayServices: selections.length }
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'special_service.deleted', entityType: 'special_service', entityId: serviceId })
  return { ok: true, deleted }
})
