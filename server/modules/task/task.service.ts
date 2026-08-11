import { and, eq } from 'drizzle-orm'
import { completionInputSchema, taskInputSchema, taskUpdateSchema } from '@contracts/crm'
import { canManageApartment, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { tasks, users } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'

export async function listTasks(actor: Actor) {
  const rows = await db.query.tasks.findMany({
    where: eq(tasks.organizationId, actor.organizationId),
    with: { apartment: { with: { hotel: true } }, assignee: true },
    orderBy: (tasks, { asc }) => [asc(tasks.dueOn)]
  })
  if (actor.roles.includes('administrator')) return rows
  return rows.filter(task => task.assigneeId === actor.id || task.apartment.managerId === actor.id).map(task => {
    if (task.apartment.managerId === actor.id) return task
    const { ownerCostEur: _ownerCostEur, ...safeTask } = task
    return safeTask
  })
}

export async function createTask(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  const data = taskInputSchema.parse(input)
  if (!(await canManageApartment(actor, data.apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  if (!actor.roles.includes('administrator') && data.ownerCostEur > 0) throw createError({ statusCode: 403, statusMessage: 'Стоимость задачи задает администратор' })
  if (data.assigneeId) {
    const assignee = await db.query.users.findFirst({ where: and(eq(users.id, data.assigneeId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
    if (!assignee) throw createError({ statusCode: 400, statusMessage: 'Исполнитель не активен' })
  }
  const [task] = await db.insert(tasks).values({ ...data, organizationId: actor.organizationId, createdById: actor.id }).returning()
  if (!task) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать задачу' })
  if (data.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [data.assigneeId], type: 'work_assigned', title: 'Назначена задача', body: task.title, href: `/tasks/${task.id}` })
  return task
}

export async function completeTask(actor: Actor, taskId: string, input: unknown) {
  const data = completionInputSchema.parse(input)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (!['open', 'in_progress'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Задачу нельзя завершить в текущем статусе' })
  if (!actor.roles.includes('administrator') && task.assigneeId !== actor.id) throw createError({ statusCode: 403, statusMessage: 'Задача не назначена вам' })
  const completeChecklist = task.checklist.every(required => data.checklist.some(item => item.label === required.label && item.checked))
  if (!completeChecklist || data.checklist.some(item => !item.checked)) throw createError({ statusCode: 400, statusMessage: 'Завершите обязательный чек-лист' })
  const updated = await db.transaction(async tx => {
    const [completed] = await tx.update(tasks).set({ status: 'completed', checklist: data.checklist, comment: data.comment, hasProblem: data.hasProblem, problemDescription: data.problemDescription, completedAt: new Date(), updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
    if (task.ownerCostEur > 0) await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: task.apartmentId, type: 'task_charge', visibility: 'manager', amountEur: task.ownerCostEur, occurredOn: new Date().toISOString().slice(0, 10), description: task.title, sourceType: 'task', sourceId: taskId, createdById: actor.id }, tx as unknown as typeof db)
    return completed
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'task.completed', entityType: 'task', entityId: taskId })
  if (data.hasProblem) await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'problem', title: 'Проблема в задаче', body: data.problemDescription, href: `/tasks/${taskId}` })
  return updated
}

export async function updateTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  const data = taskUpdateSchema.parse(input)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)), with: { apartment: true } })
  if (!task || !(await canManageApartment(actor, task.apartmentId))) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (['completed', 'canceled'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Завершенную или отмененную задачу нельзя изменить' })
  if (data.status && data.status !== 'canceled') throw createError({ statusCode: 400, statusMessage: 'Для начала и завершения задачи используйте отдельные действия' })
  if (!actor.roles.includes('administrator') && 'ownerCostEur' in data) throw createError({ statusCode: 403, statusMessage: 'Стоимость задачи задает администратор' })
  if (data.assigneeId) {
    const assignee = await db.query.users.findFirst({ where: and(eq(users.id, data.assigneeId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
    if (!assignee) throw createError({ statusCode: 400, statusMessage: 'Исполнитель не активен' })
  }
  const [updated] = await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить задачу' })
  if (data.assigneeId && data.assigneeId !== task.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [data.assigneeId], type: 'work_assigned', title: 'Назначена задача', body: updated.title, href: `/tasks/${taskId}` })
  if (data.status === 'canceled' && task.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [task.assigneeId], type: 'work_canceled', title: 'Задача отменена', body: updated.title, href: `/tasks/${taskId}` })
  return updated
}

export async function startTask(actor: Actor, taskId: string) {
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task || (!actor.roles.includes('administrator') && task.assigneeId !== actor.id)) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (!['open', 'in_progress'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Задачу нельзя начать в текущем статусе' })
  return (await db.update(tasks).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning())[0]
}
