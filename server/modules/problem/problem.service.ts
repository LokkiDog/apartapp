import { and, asc, desc, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { problemExpenseSchema, problemInputSchema, problemListQuerySchema, problemResolveWithTaskSchema, problemTaskInputSchema, problemUpdateSchema } from '@contracts/problem'
import type { Actor } from '../../infrastructure/auth/actor'
import { requireRole } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleaningProblems, cleanings, financialEntries, tasks, users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { createFinancialEntry } from '../finance/finance.service'
import { cleaningProblemSummary } from '../cleaning/cleaning-problem'
import { canBeWorkAssignee } from '../work/work-policy'
import { deleteWorkRecord } from '../work/work-record.service'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'

function today() { return new Date().toISOString().slice(0, 10) }

async function requireProblem(actor: Actor, problemId: string) {
  const problem = await db.query.cleaningProblems.findFirst({
    where: and(eq(cleaningProblems.id, problemId), eq(cleaningProblems.organizationId, actor.organizationId)),
    with: { apartment: { with: { hotel: true } }, cleaning: true, createdBy: { columns: { id: true, name: true } }, resolvedBy: { columns: { id: true, name: true } } }
  })
  if (!problem) throw createError({ statusCode: 404, statusMessage: 'Проблема не найдена' })
  return problem
}

async function serializeProblems(actor: Actor, rows: Awaited<ReturnType<typeof db.query.cleaningProblems.findMany>>) {
  const ids = rows.map(problem => problem.id)
  const [attachmentRows, expenseRows, solutionRows] = await Promise.all([
    ids.length ? db.select({ id: attachments.id, entityId: attachments.entityId, fileName: attachments.fileName, mimeType: attachments.mimeType }).from(attachments).where(and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, ids))).orderBy(asc(attachments.createdAt)) : Promise.resolve([]),
    ids.length ? db.select({ id: financialEntries.id, problemId: financialEntries.problemId, occurredOn: financialEntries.occurredOn, amountEur: financialEntries.amountEur, description: financialEntries.description, createdAt: financialEntries.createdAt }).from(financialEntries).where(and(eq(financialEntries.organizationId, actor.organizationId), inArray(financialEntries.problemId, ids))).orderBy(desc(financialEntries.occurredOn), desc(financialEntries.createdAt)) : Promise.resolve([]),
    ids.length ? db.query.tasks.findMany({ where: and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.problemId, ids)), with: { assignee: { columns: { id: true, name: true } } }, orderBy: [desc(tasks.completedAt), desc(tasks.createdAt)] }) : Promise.resolve([])
  ])
  return rows.map(problem => ({
    ...problem,
    attachments: attachmentRows.filter(item => item.entityId === problem.id),
    expenses: expenseRows.filter(item => item.problemId === problem.id),
    totalExpenseEur: expenseRows.filter(item => item.problemId === problem.id).reduce((sum, item) => sum + Number(item.amountEur), 0),
    solutionTasks: solutionRows.filter(task => task.problemId === problem.id),
    activeSolutionTask: solutionRows.find(task => task.problemId === problem.id && ['open', 'in_progress'].includes(task.status)) ?? null
  }))
}

export async function listProblems(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const query = problemListQuerySchema.parse(input)
  const conditions = [eq(cleaningProblems.organizationId, actor.organizationId)]
  if (query.apartmentId) conditions.push(eq(cleaningProblems.apartmentId, query.apartmentId))
  if (query.status === 'open') conditions.push(isNull(cleaningProblems.resolvedAt))
  if (query.status === 'resolved') conditions.push(isNotNull(cleaningProblems.resolvedAt))
  const rows = await db.query.cleaningProblems.findMany({
    where: and(...conditions),
    with: { apartment: { with: { hotel: true } }, cleaning: true, createdBy: { columns: { id: true, name: true } }, resolvedBy: { columns: { id: true, name: true } } },
    orderBy: [desc(cleaningProblems.createdAt)]
  })
  return serializeProblems(actor, rows)
}

export async function getProblem(actor: Actor, problemId: string) {
  requireRole(actor, 'administrator')
  return (await serializeProblems(actor, [await requireProblem(actor, problemId)]))[0]!
}

export async function problemDashboard(actor: Actor) {
  requireRole(actor, 'administrator')
  const rows = await db.query.cleaningProblems.findMany({ where: and(eq(cleaningProblems.organizationId, actor.organizationId), isNull(cleaningProblems.resolvedAt)), with: { apartment: { with: { hotel: true } } }, orderBy: [desc(cleaningProblems.createdAt)] })
  return { openCount: rows.length, items: rows.slice(0, 4).map(row => ({ id: row.id, description: row.description, apartment: row.apartment })) }
}

export async function createProblemTask(actor: Actor, problemId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemTaskInputSchema.parse(input)
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала переоткройте проблему' })
  const active = await db.query.tasks.findFirst({ where: and(eq(tasks.problemId, problemId), inArray(tasks.status, ['open', 'in_progress'])) })
  if (active) throw createError({ statusCode: 409, statusMessage: 'Для проблемы уже назначена активная задача' })
  const assignee = await db.query.users.findFirst({ where: and(eq(users.id, data.assigneeId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
  if (!assignee || !canBeWorkAssignee(assignee.roles)) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активным исполнителем, специалистом или администратором' })
  const [task] = await db.insert(tasks).values({ ...data, organizationId: actor.organizationId, apartmentId: problem.apartmentId, problemId, createdById: actor.id }).returning()
  if (!task) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать задачу' })
  await notifyUsers({ organizationId: actor.organizationId, userIds: [data.assigneeId], type: 'work_assigned', title: 'Назначена задача', body: task.title, href: `/tasks/${task.id}` })
  return getProblem(actor, problemId)
}

export async function createProblem(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemInputSchema.parse(input)
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, data.apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const [created] = await db.insert(cleaningProblems).values({ organizationId: actor.organizationId, apartmentId: data.apartmentId, description: data.description, details: data.details, createdById: actor.id }).returning({ id: cleaningProblems.id })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.created', entityType: 'cleaning_problem', entityId: created!.id })
  return getProblem(actor, created!.id)
}

export async function updateProblem(actor: Actor, problemId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemUpdateSchema.parse(input)
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала переоткройте проблему' })
  await db.update(cleaningProblems).set({ description: data.description, ...(data.details === undefined ? {} : { details: data.details }), updatedAt: new Date() }).where(eq(cleaningProblems.id, problemId))
  if (problem.cleaningId) await refreshCleaningProblemSummary(actor.organizationId, problem.cleaningId)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.updated', entityType: 'cleaning_problem', entityId: problemId })
  return getProblem(actor, problemId)
}

export async function resolveProblem(actor: Actor, problemId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemResolveWithTaskSchema.parse(input)
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) return getProblem(actor, problemId)
  const active = await db.query.tasks.findFirst({ where: and(eq(tasks.problemId, problemId), inArray(tasks.status, ['open', 'in_progress'])) })
  if (active && !data.taskDisposition) throw createError({ statusCode: 409, statusMessage: 'Выберите, отменить или удалить связанную задачу' })
  if (active?.id && data.taskDisposition === 'delete') await deleteWorkRecord('task', active.id)
  if (active?.id && data.taskDisposition === 'cancel') await db.update(tasks).set({ status: 'canceled', problemId: null, updatedAt: new Date() }).where(eq(tasks.id, active.id))
  await db.update(cleaningProblems).set({ resolvedAt: new Date(), resolvedById: actor.id, resolutionComment: data.resolutionComment, updatedAt: new Date() }).where(eq(cleaningProblems.id, problemId))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.resolved', entityType: 'cleaning_problem', entityId: problemId })
  return getProblem(actor, problemId)
}

export async function requestProblemDeletion(actor: Actor, problemId: string) {
  const problem = await requireProblem(actor, problemId)
  await db.update(cleaningProblems).set({ deletionRequestedAt: new Date(), deletionRequestedById: actor.id, updatedAt: new Date() }).where(eq(cleaningProblems.id, problem.id))
  await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'problem', title: 'Запрошено удаление проблемы', body: problem.description, href: `/problems?problemId=${problem.id}` })
}

export async function decideProblemDeletion(actor: Actor, problemId: string, approved: boolean) {
  requireRole(actor, 'administrator')
  const problem = await requireProblem(actor, problemId)
  if (!problem.deletionRequestedAt) throw createError({ statusCode: 409, statusMessage: 'Запрос на удаление не найден' })
  const requesterId = problem.deletionRequestedById
  if (!approved) {
    await db.update(cleaningProblems).set({ deletionRequestedAt: null, deletionRequestedById: null, updatedAt: new Date() }).where(eq(cleaningProblems.id, problemId))
    if (requesterId) await notifyUsers({ organizationId: actor.organizationId, userIds: [requesterId], type: 'problem', title: 'Удаление проблемы отклонено', body: problem.description, href: problem.cleaningId ? `/cleanings/${problem.cleaningId}` : problem.sourceTaskId ? `/tasks/${problem.sourceTaskId}` : `/problems?problemId=${problemId}` })
    return getProblem(actor, problemId)
  }
  if (requesterId) await notifyUsers({ organizationId: actor.organizationId, userIds: [requesterId], type: 'problem', title: 'Проблема удалена', body: problem.description, href: null })
  await deleteProblem(actor, problemId)
  return { ok: true }
}

export async function reopenProblem(actor: Actor, problemId: string) {
  requireRole(actor, 'administrator')
  await requireProblem(actor, problemId)
  await db.update(cleaningProblems).set({ resolvedAt: null, resolvedById: null, resolutionComment: '', updatedAt: new Date() }).where(eq(cleaningProblems.id, problemId))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.reopened', entityType: 'cleaning_problem', entityId: problemId })
  return getProblem(actor, problemId)
}

export async function deleteProblem(actor: Actor, problemId: string) {
  requireRole(actor, 'administrator')
  const problem = await requireProblem(actor, problemId)
  const solutionTaskIds = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.organizationId, actor.organizationId), eq(tasks.problemId, problemId)))
  for (const task of solutionTaskIds) await deleteWorkRecord('task', task.id)
  const storageKeys = await db.transaction(async tx => {
    const rows = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(and(eq(attachments.organizationId, actor.organizationId), eq(attachments.entityType, 'cleaning_problem'), eq(attachments.entityId, problemId)))
    await tx.delete(attachments).where(and(eq(attachments.entityType, 'cleaning_problem'), eq(attachments.entityId, problemId)))
    await tx.delete(cleaningProblems).where(and(eq(cleaningProblems.id, problemId), eq(cleaningProblems.organizationId, actor.organizationId)))
    return rows.map((row: { storageKey: string }) => row.storageKey)
  })
  if (problem.cleaningId) await refreshCleaningProblemSummary(actor.organizationId, problem.cleaningId)
  if (problem.sourceTaskId) await db.update(tasks).set({ hasProblem: false, problemDescription: '', problemDetails: '', updatedAt: new Date() }).where(eq(tasks.id, problem.sourceTaskId))
  await Promise.allSettled(storageKeys.map(key => fileStorage.remove(key)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.deleted', entityType: 'cleaning_problem', entityId: problemId })
  return { ok: true }
}

export async function createProblemExpense(actor: Actor, problemId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemExpenseSchema.parse(input)
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала переоткройте проблему' })
  const sourceId = randomUUID()
  const entry = await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: problem.apartmentId, type: 'task_charge', visibility: 'manager', amountEur: data.amountEur, occurredOn: data.occurredOn || today(), description: data.description, sourceType: 'problem_expense', sourceId, problemId, createdById: actor.id })
  if (!entry) throw createError({ statusCode: 409, statusMessage: 'Не удалось добавить расход' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'problem.expense_created', entityType: 'cleaning_problem', entityId: problemId, payload: { expenseId: entry.id } })
  return getProblem(actor, problemId)
}

export async function updateProblemExpense(actor: Actor, problemId: string, expenseId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = problemExpenseSchema.parse(input)
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала переоткройте проблему' })
  const [updated] = await db.update(financialEntries).set({ occurredOn: data.occurredOn, amountEur: data.amountEur, description: data.description }).where(and(eq(financialEntries.id, expenseId), eq(financialEntries.problemId, problemId), eq(financialEntries.organizationId, actor.organizationId))).returning({ id: financialEntries.id })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Расход не найден' })
  return getProblem(actor, problemId)
}

export async function deleteProblemExpense(actor: Actor, problemId: string, expenseId: string) {
  requireRole(actor, 'administrator')
  const problem = await requireProblem(actor, problemId)
  if (problem.resolvedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала переоткройте проблему' })
  const [deleted] = await db.delete(financialEntries).where(and(eq(financialEntries.id, expenseId), eq(financialEntries.problemId, problemId), eq(financialEntries.organizationId, actor.organizationId))).returning({ id: financialEntries.id })
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Расход не найден' })
  return getProblem(actor, problemId)
}

export async function refreshCleaningProblemSummary(organizationId: string, cleaningId: string) {
  const problems = await db.select({ id: cleaningProblems.id, description: cleaningProblems.description }).from(cleaningProblems).where(and(eq(cleaningProblems.organizationId, organizationId), eq(cleaningProblems.cleaningId, cleaningId)))
  await db.update(cleanings).set({ hasProblem: problems.length > 0, problemDescription: cleaningProblemSummary(problems), updatedAt: new Date() }).where(and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, organizationId)))
}
