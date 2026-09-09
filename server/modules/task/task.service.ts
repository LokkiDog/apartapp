import { and, eq } from 'drizzle-orm'
import { completionInputSchema, taskInputSchema, taskUpdateSchema, workProgressInputSchema } from '@contracts/crm'
import { requireRole, requireWorkSectionAccess, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartments, cleaningProblems, financialEntries, inventoryMovements, tasks, users } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'
import { deleteWorkRecord } from '../work/work-record.service'
import { canBeWorkAssignee, canChangeTaskApartment } from '../work/work-policy'
import { serializeApartment } from '../apartment/apartment-view'

async function syncTaskProblem(actor: Actor, task: { id: string, apartmentId: string, createdById: string, hasProblem: boolean, problemDescription: string, problemDetails: string }, data: { hasProblem: boolean, problemDescription: string, problemDetails?: string }) {
  const existing = await db.query.cleaningProblems.findFirst({ where: and(eq(cleaningProblems.sourceTaskId, task.id), eq(cleaningProblems.organizationId, actor.organizationId)) })
  if (data.hasProblem && data.problemDescription.trim()) {
    if (existing) {
      await db.update(cleaningProblems).set({ description: data.problemDescription.trim(), ...(data.problemDetails === undefined ? {} : { details: data.problemDetails }), updatedAt: new Date() }).where(eq(cleaningProblems.id, existing.id))
      return existing.id
    }
    const [created] = await db.insert(cleaningProblems).values({ organizationId: actor.organizationId, apartmentId: task.apartmentId, sourceTaskId: task.id, description: data.problemDescription.trim(), details: data.problemDetails ?? '', createdById: task.createdById }).returning({ id: cleaningProblems.id })
    return created!.id
  }
  if (existing) {
    const [expenses, solutionTasks] = await Promise.all([
      db.select({ id: financialEntries.id }).from(financialEntries).where(eq(financialEntries.problemId, existing.id)).limit(1),
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.problemId, existing.id)).limit(1)
    ])
    if (expenses.length || solutionTasks.length) {
      await db.update(cleaningProblems).set({ deletionRequestedAt: new Date(), deletionRequestedById: actor.id, updatedAt: new Date() }).where(eq(cleaningProblems.id, existing.id))
      await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'problem', title: 'Запрошено удаление проблемы', body: existing.description, href: `/problems?problemId=${existing.id}` })
      return existing.id
    }
    await db.delete(cleaningProblems).where(eq(cleaningProblems.id, existing.id))
  }
  return null
}

export async function listTasks(actor: Actor) {
  requireWorkSectionAccess(actor)
  const rows = await db.query.tasks.findMany({
    where: eq(tasks.organizationId, actor.organizationId),
    with: { apartment: { with: { hotel: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } }, assignee: true },
    orderBy: (tasks, { asc }) => [asc(tasks.dueOn)]
  })
  if (actor.roles.includes('administrator')) return rows.map(task => ({ ...task, apartment: serializeApartment(task.apartment) }))
  return rows.filter(task => task.assigneeId === actor.id).map(task => {
    const apartment = serializeApartment(task.apartment)
    const { ownerCostEur: _ownerCostEur, ...safeTask } = task
    return { ...safeTask, apartment }
  })
}

export async function createTask(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = taskInputSchema.parse(input)
  if (data.assigneeId) {
    const assignee = await db.query.users.findFirst({ where: and(eq(users.id, data.assigneeId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
    if (!assignee || !canBeWorkAssignee(assignee.roles)) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активным исполнителем, специалистом или администратором' })
  }
  const [task] = await db.insert(tasks).values({ ...data, organizationId: actor.organizationId, createdById: actor.id }).returning()
  if (!task) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать задачу' })
  if (data.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [data.assigneeId], type: 'work_assigned', title: 'Назначена задача', body: task.title, href: `/tasks/${task.id}` })
  return task
}

export async function completeTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator', 'cleaner', 'specialist')
  const data = completionInputSchema.parse(input)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (!['open', 'in_progress'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Задачу нельзя завершить в текущем статусе' })
  if (!actor.roles.includes('administrator') && task.assigneeId !== actor.id) throw createError({ statusCode: 403, statusMessage: 'Задача не назначена вам' })
  const completeChecklist = task.checklist.every(required => data.checklist.some(item => item.label === required.label && item.checked))
  if (!completeChecklist || data.checklist.some(item => !item.checked)) throw createError({ statusCode: 400, statusMessage: 'Завершите обязательный чек-лист' })
  const updated = await db.transaction(async tx => {
    const [completed] = await tx.update(tasks).set({ status: 'completed', checklist: data.checklist, comment: data.comment, hasProblem: data.hasProblem, problemDescription: data.problemDescription, ...(data.problemDetails === undefined ? {} : { problemDetails: data.problemDetails }), completedAt: new Date(), updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
    if (task.ownerCostEur > 0) await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: task.apartmentId, type: 'task_charge', visibility: 'manager', amountEur: task.ownerCostEur, occurredOn: new Date().toISOString().slice(0, 10), description: task.title, sourceType: 'task', sourceId: taskId, problemId: task.problemId ?? null, createdById: actor.id }, tx as unknown as typeof db)
    return completed
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'task.completed', entityType: 'task', entityId: taskId })
  const problemId = await syncTaskProblem(actor, task, data)
  if (problemId) {
    const administrators = await administratorsForOrganization(actor.organizationId)
    await notifyUsers({ organizationId: actor.organizationId, userIds: actor.roles.includes('administrator') ? administrators.filter(id => id !== actor.id) : administrators, type: 'problem', title: task.problemId ? 'Задача решения завершена' : 'Проблема в задаче', body: task.problemId ? task.title : data.problemDescription, href: `/problems?problemId=${task.problemId ?? problemId}` })
  }
  return updated
}

export async function saveTaskProgress(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator', 'cleaner', 'specialist')
  const data = workProgressInputSchema.parse(input)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (['completed', 'canceled'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Завершенную или отмененную задачу нельзя изменить' })
  if (!actor.roles.includes('administrator') && task.assigneeId !== actor.id) throw createError({ statusCode: 403, statusMessage: 'Задача не назначена вам' })
  const [updated] = await db.update(tasks).set({ checklist: data.checklist, comment: data.comment, hasProblem: data.hasProblem, problemDescription: data.problemDescription, ...(data.problemDetails === undefined ? {} : { problemDetails: data.problemDetails }), updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
  await syncTaskProblem(actor, task, data)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'task.progress_saved', entityType: 'task', entityId: taskId })
  return updated
}

export async function updateTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = taskUpdateSchema.parse(input)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)), with: { apartment: true } })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (['completed', 'canceled'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Завершенную или отмененную задачу нельзя изменить' })
  if (data.status && data.status !== 'canceled') throw createError({ statusCode: 400, statusMessage: 'Для начала и завершения задачи используйте отдельные действия' })
  if (data.apartmentId && data.apartmentId !== task.apartmentId) {
    const usage = await db.query.inventoryMovements.findFirst({ where: and(eq(inventoryMovements.sourceType, 'task'), eq(inventoryMovements.sourceId, taskId)) })
    if (!canChangeTaskApartment(task.status, Boolean(usage))) {
      const statusMessage = task.status !== 'open' ? 'Апартамент можно изменить только у открытой задачи' : 'Апартамент нельзя изменить после списания расходников'
      throw createError({ statusCode: 409, statusMessage })
    }
    const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, data.apartmentId), eq(apartments.organizationId, actor.organizationId)) })
    if (!apartment) throw createError({ statusCode: 400, statusMessage: 'Апартамент не найден' })
  }
  if (data.assigneeId) {
    const assignee = await db.query.users.findFirst({ where: and(eq(users.id, data.assigneeId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
    if (!assignee || !canBeWorkAssignee(assignee.roles)) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активным исполнителем, специалистом или администратором' })
  }
  const [updated] = await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить задачу' })
  if (data.assigneeId && data.assigneeId !== task.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [data.assigneeId], type: 'work_assigned', title: 'Назначена задача', body: updated.title, href: `/tasks/${taskId}` })
  if (data.status === 'canceled') await db.update(tasks).set({ problemId: null }).where(eq(tasks.id, taskId))
  if (data.status === 'canceled' && task.assigneeId) await notifyUsers({ organizationId: actor.organizationId, userIds: [task.assigneeId], type: 'work_canceled', title: 'Задача отменена', body: updated.title, href: `/tasks/${taskId}` })
  return updated
}

export async function deleteTask(actor: Actor, taskId: string) {
  requireRole(actor, 'administrator')
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  await deleteWorkRecord('task', taskId)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'task.deleted', entityType: 'task', entityId: taskId })
  return { ok: true }
}

export async function startTask(actor: Actor, taskId: string) {
  requireRole(actor, 'administrator', 'cleaner', 'specialist')
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)) })
  if (!task || (!actor.roles.includes('administrator') && task.assigneeId !== actor.id)) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  if (!['open', 'in_progress'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Задачу нельзя начать в текущем статусе' })
  return (await db.update(tasks).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(tasks.id, taskId)).returning())[0]
}
