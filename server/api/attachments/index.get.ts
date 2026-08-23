import { and, asc, eq } from 'drizzle-orm'
import { canAccessAssignedWork, canManageApartment, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleanings, tasks } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const actor = await requireActor(event); const query = getQuery(event)
  if (typeof query.entityType !== 'string' || typeof query.entityId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Укажите объект' })
  if (!['cleaning', 'task', 'apartment'].includes(query.entityType)) throw createError({ statusCode: 400, statusMessage: 'Неверный тип объекта' })
  if (!actor.roles.includes('administrator')) {
    const allowed = query.entityType === 'apartment'
      ? await canManageApartment(actor, query.entityId)
      : query.entityType === 'cleaning'
      ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, query.entityId), eq(cleanings.organizationId, actor.organizationId)), with: { assignments: true } }).then(cleaning => Boolean(cleaning && cleaning.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))))
      : await db.query.tasks.findFirst({ where: and(eq(tasks.id, query.entityId), eq(tasks.organizationId, actor.organizationId)) }).then(task => Boolean(task && canAccessAssignedWork(actor, task.assigneeId)))
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к вложениям' })
  }
  return db.query.attachments.findMany({ where: and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, query.entityType), eq(attachments.entityId, query.entityId)), orderBy: [asc(attachments.createdAt)] })
})
