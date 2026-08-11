import { and, asc, eq } from 'drizzle-orm'
import { requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleanings, tasks } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const actor = await requireActor(event); const query = getQuery(event)
  if (typeof query.entityType !== 'string' || typeof query.entityId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Укажите объект' })
  if (!['cleaning', 'task', 'apartment'].includes(query.entityType)) throw createError({ statusCode: 400, statusMessage: 'Неверный тип объекта' })
  if (!actor.roles.includes('administrator')) {
    const allowed = query.entityType === 'apartment'
      ? await db.query.apartments.findFirst({ where: and(eq(apartments.id, query.entityId), eq(apartments.organizationId, actor.organizationId), eq(apartments.managerId, actor.id)) }).then(Boolean)
      : query.entityType === 'cleaning'
      ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, query.entityId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: true, assignments: true } }).then(cleaning => Boolean(cleaning && (cleaning.apartment.managerId === actor.id || cleaning.assignments.some(item => item.cleanerId === actor.id))))
      : await db.query.tasks.findFirst({ where: and(eq(tasks.id, query.entityId), eq(tasks.organizationId, actor.organizationId)), with: { apartment: true } }).then(task => Boolean(task && (task.apartment.managerId === actor.id || task.assigneeId === actor.id)))
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к вложениям' })
  }
  return db.query.attachments.findMany({ where: and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, query.entityType), eq(attachments.entityId, query.entityId)), orderBy: [asc(attachments.createdAt)] })
})
