import { and, asc, eq, inArray } from 'drizzle-orm'
import { canAccessAssignedWork, canManageApartment, requireActor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleaningProblems, cleanings, tasks } from '../../infrastructure/database/schema'
export default defineEventHandler(async event => {
  const actor = await requireActor(event); const query = getQuery(event)
  if (typeof query.entityType !== 'string' || typeof query.entityId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Укажите объект' })
  if (!['cleaning_problem', 'cleaning', 'task', 'apartment'].includes(query.entityType)) throw createError({ statusCode: 400, statusMessage: 'Неверный тип объекта' })
  if (query.entityType === 'cleaning') {
    const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, query.entityId), eq(cleanings.organizationId, actor.organizationId)), with: { assignments: true, problems: true } })
    if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
    if (!actor.roles.includes('administrator') && !cleaning.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к вложениям' })
    const problemIds = cleaning.problems.map(problem => problem.id)
    return problemIds.length ? db.query.attachments.findMany({ where: and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, problemIds)), orderBy: [asc(attachments.createdAt)] }) : []
  }
  if (!actor.roles.includes('administrator')) {
    const allowed = query.entityType === 'apartment'
      ? await canManageApartment(actor, query.entityId)
      : query.entityType === 'cleaning_problem'
      ? await db.query.cleaningProblems.findFirst({ where: and(eq(cleaningProblems.id, query.entityId), eq(cleaningProblems.organizationId, actor.organizationId)), with: { cleaning: { with: { assignments: true } } } }).then(problem => Boolean(problem?.cleaning?.assignments.some(item => canAccessAssignedWork(actor, item.cleanerId))))
      : await db.query.tasks.findFirst({ where: and(eq(tasks.id, query.entityId), eq(tasks.organizationId, actor.organizationId)) }).then(task => Boolean(task && canAccessAssignedWork(actor, task.assigneeId)))
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к вложениям' })
  }
  return db.query.attachments.findMany({ where: and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, query.entityType), eq(attachments.entityId, query.entityId)), orderBy: [asc(attachments.createdAt)] })
})
