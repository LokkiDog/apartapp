import { and, eq } from 'drizzle-orm'
import { cashTaskCollectSchema, cashTaskCorrectionSchema, cashTaskReceiveSchema } from '@contracts/crm'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { cashTaskDetails, cleanings, financialEntries, tasks, users } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry, syncCashReceiptReport } from '../finance/finance.service'
import { canBeWorkAssignee } from '../work/work-policy'
import { publishTaskChange } from './task-events'

const cashTaskTitle = 'Получить наличные'

async function cashTaskForActor(actor: Actor, taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId), eq(tasks.category, 'cash')),
    with: { cash: true }
  })
  if (!task?.cash) throw createError({ statusCode: 404, statusMessage: 'Задача по наличным не найдена' })
  return task
}

export async function syncCashTaskForCleaning(actor: Actor, cleaningId: string, cashAssigneeId: string | null | undefined) {
  const cleaning = await db.query.cleanings.findFirst({
    where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)),
    with: { stay: true }
  })
  if (!cleaning) return
  const existing = await db.query.cashTaskDetails.findFirst({ where: and(eq(cashTaskDetails.cleaningId, cleaningId), eq(cashTaskDetails.organizationId, actor.organizationId)), with: { task: true } })
  const effectiveAssigneeId = cashAssigneeId === undefined ? existing?.task.assigneeId : cashAssigneeId
  const actionable = Boolean(cleaning.status !== 'canceled' && cleaning.stay && Number(cleaning.stay.cashAmountEur ?? 0) > 0 && effectiveAssigneeId)
  if (!actionable) {
    if (existing && !existing.collectedAt && !['completed', 'canceled'].includes(existing.task.status)) {
      await db.update(tasks).set({ status: 'canceled', updatedAt: new Date() }).where(eq(tasks.id, existing.taskId))
      await publishTaskChange({ actor, taskId: existing.taskId, assigneeIds: [existing.task.assigneeId], reason: 'updated' })
    }
    return
  }
  const assignee = await db.query.users.findFirst({ where: and(eq(users.id, effectiveAssigneeId!), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
  if (!assignee || !canBeWorkAssignee(assignee.roles)) throw createError({ statusCode: 400, statusMessage: 'Ответственный за наличные должен быть активным исполнителем, специалистом или администратором' })
  const expectedAmountEur = Number(cleaning.stay!.cashAmountEur)
  if (existing) {
    if (!existing.collectedAt && !['completed', 'canceled'].includes(existing.task.status)) {
      await db.transaction(async tx => {
        await tx.update(tasks).set({ apartmentId: cleaning.apartmentId, assigneeId: effectiveAssigneeId!, dueOn: cleaning.scheduledOn, title: cashTaskTitle, updatedAt: new Date() }).where(eq(tasks.id, existing.taskId))
        await tx.update(cashTaskDetails).set({ stayId: cleaning.stayId, expectedAmountEur, reportOccurredOn: cleaning.stay!.checkOutOn, updatedAt: new Date() }).where(eq(cashTaskDetails.taskId, existing.taskId))
      })
      await publishTaskChange({ actor, taskId: existing.taskId, assigneeIds: [existing.task.assigneeId, effectiveAssigneeId!], reason: 'updated' })
    }
    return
  }
  const [task] = await db.insert(tasks).values({ organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, createdById: actor.id, assigneeId: effectiveAssigneeId!, category: 'cash', title: cashTaskTitle, description: '', dueOn: cleaning.scheduledOn, priority: 'normal', ownerCostEur: 0, checklist: [] }).returning()
  if (!task) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать задачу по наличным' })
  await db.insert(cashTaskDetails).values({ taskId: task.id, organizationId: actor.organizationId, stayId: cleaning.stayId, cleaningId, expectedAmountEur, reportOccurredOn: cleaning.stay!.checkOutOn, reportIncluded: true })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cash_task.created', entityType: 'task', entityId: task.id, payload: { cleaningId, stayId: cleaning.stayId } })
  await publishTaskChange({ actor, taskId: task.id, assigneeIds: [effectiveAssigneeId!], reason: 'created' })
  await notifyUsers({ organizationId: actor.organizationId, userIds: [effectiveAssigneeId!], type: 'work_assigned', title: 'Назначено получение наличных', body: cashTaskTitle, href: `/tasks/${task.id}` })
}

export async function syncCashTasksForStay(actor: Actor, stayId: string) {
  const rows = await db.select({ cleaningId: cashTaskDetails.cleaningId }).from(cashTaskDetails)
    .where(and(eq(cashTaskDetails.organizationId, actor.organizationId), eq(cashTaskDetails.stayId, stayId)))
  await Promise.all(rows.filter(row => row.cleaningId).map(row => syncCashTaskForCleaning(actor, row.cleaningId!, undefined)))
}

export async function collectCashTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator', 'cleaner', 'specialist')
  const data = cashTaskCollectSchema.parse(input)
  const task = await cashTaskForActor(actor, taskId)
  if (!actor.roles.includes('administrator') && task.assigneeId !== actor.id) throw createError({ statusCode: 403, statusMessage: 'Задача не назначена вам' })
  if (!['open', 'in_progress'].includes(task.status)) throw createError({ statusCode: 409, statusMessage: 'Наличные нельзя отметить забранными в текущем статусе' })
  const now = new Date()
  await db.transaction(async tx => {
    await tx.update(tasks).set({ status: 'resolved', updatedAt: now }).where(eq(tasks.id, taskId))
    await tx.update(cashTaskDetails).set({ collectedAmountEur: data.amountEur, collectedById: actor.id, collectedAt: now, updatedAt: now }).where(eq(cashTaskDetails.taskId, taskId))
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cash_task.collected', entityType: 'task', entityId: taskId, payload: { amountEur: data.amountEur } })
  await publishTaskChange({ actor, taskId, assigneeIds: [task.assigneeId], reason: 'resolved' })
  await notifyUsers({ organizationId: actor.organizationId, userIds: (await administratorsForOrganization(actor.organizationId)).filter(id => id !== actor.id), type: 'task_resolved', title: 'Наличные ожидают передачи', body: task.title, href: `/tasks/${taskId}` })
  return cashTaskForActor(actor, taskId)
}

export async function receiveCashTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cashTaskReceiveSchema.parse(input)
  const task = await cashTaskForActor(actor, taskId)
  const cash = task.cash!
  if (task.status !== 'resolved' || !cash.collectedAt) throw createError({ statusCode: 409, statusMessage: 'Сначала исполнитель должен отметить получение наличных' })
  const now = new Date()
  const occurredOn = cash.reportOccurredOn ?? now.toISOString().slice(0, 10)
  await db.transaction(async tx => {
    await tx.update(tasks).set({ status: 'completed', completedAt: now, updatedAt: now }).where(eq(tasks.id, taskId))
    await tx.update(cashTaskDetails).set({ receivedAmountEur: data.amountEur, receivedById: actor.id, receivedAt: now, reportOccurredOn: occurredOn, updatedAt: now }).where(eq(cashTaskDetails.taskId, taskId))
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: task.apartmentId, type: 'cash_receipt', visibility: cash.reportIncluded ? 'manager' : 'administrator', amountEur: -Math.abs(data.amountEur), occurredOn, description: 'Наличные', sourceType: 'cash_task', sourceId: taskId, createdById: actor.id }, tx as unknown as typeof db)
  })
  await syncCashReceiptReport({ organizationId: actor.organizationId, apartmentId: task.apartmentId, taskId, occurredOn, amountEur: data.amountEur, included: cash.reportIncluded })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cash_task.received', entityType: 'task', entityId: taskId, payload: { amountEur: data.amountEur } })
  await publishTaskChange({ actor, taskId, assigneeIds: [task.assigneeId], reason: 'completed' })
  return cashTaskForActor(actor, taskId)
}

export async function correctCashTask(actor: Actor, taskId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cashTaskCorrectionSchema.parse(input)
  const task = await cashTaskForActor(actor, taskId)
  const cash = task.cash!
  if (task.status !== 'completed' || cash.receivedAmountEur === null) throw createError({ statusCode: 409, statusMessage: 'Корректировать можно только подтвержденные наличные' })
  const amountEur = data.amountEur ?? cash.receivedAmountEur
  const reportIncluded = data.reportIncluded ?? cash.reportIncluded
  const occurredOn = cash.reportOccurredOn ?? cash.receivedAt!.toISOString().slice(0, 10)
  await db.transaction(async tx => {
    await tx.update(cashTaskDetails).set({ receivedAmountEur: amountEur, reportIncluded, updatedAt: new Date() }).where(eq(cashTaskDetails.taskId, taskId))
    await tx.update(financialEntries).set({ amountEur: -Math.abs(amountEur), visibility: reportIncluded ? 'manager' : 'administrator' }).where(and(eq(financialEntries.sourceType, 'cash_task'), eq(financialEntries.sourceId, taskId), eq(financialEntries.type, 'cash_receipt')))
  })
  await syncCashReceiptReport({ organizationId: actor.organizationId, apartmentId: task.apartmentId, taskId, occurredOn, amountEur, included: reportIncluded })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cash_task.corrected', entityType: 'task', entityId: taskId, payload: { amountEur, reportIncluded } })
  return cashTaskForActor(actor, taskId)
}

export async function returnCashTaskToWork(actor: Actor, taskId: string) {
  requireRole(actor, 'administrator')
  const task = await cashTaskForActor(actor, taskId)
  if (task.status !== 'resolved') throw createError({ statusCode: 409, statusMessage: 'Вернуть можно только ожидающую передачи задачу' })
  await db.transaction(async tx => {
    await tx.update(tasks).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(tasks.id, taskId))
    await tx.update(cashTaskDetails).set({ collectedAmountEur: null, collectedById: null, collectedAt: null, updatedAt: new Date() }).where(eq(cashTaskDetails.taskId, taskId))
  })
  await publishTaskChange({ actor, taskId, assigneeIds: [task.assigneeId], reason: 'returned' })
  return cashTaskForActor(actor, taskId)
}
