import { and, eq, inArray } from 'drizzle-orm'
import { cleaningAssignmentInputSchema, cleaningTariffOverrideSchema, completionInputSchema } from '@contracts/crm'
import { requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { cleaningAssignments, cleanings, stays, users } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'
import { apartmentTariff } from '../apartment/apartment.service'

export async function createCleaningForStay(input: { organizationId: string, stayId: string, apartmentId: string }) {
  const tariff = await apartmentTariff(input.apartmentId)
  const checklist = [
    { label: 'Сменить белье и полотенца', checked: false },
    { label: 'Проверить санузел и кухню', checked: false },
    { label: 'Проверить расходники', checked: false }
  ]
  const [cleaning] = await db.insert(cleanings).values({ ...input, tariffSnapshot: tariff, checklist }).returning()
  return cleaning
}

export async function listCleanings(actor: Actor) {
  const all = await db.query.cleanings.findMany({
    where: eq(cleanings.organizationId, actor.organizationId),
    with: { apartment: { with: { hotel: true } }, assignments: { with: { cleaner: true } }, stay: true },
    orderBy: (cleanings, { asc }) => [asc(cleanings.scheduledOn)]
  })
  if (actor.roles.includes('administrator')) return all
  const assigned = actor.roles.includes('cleaner')
    ? await db.select({ cleaningId: cleaningAssignments.cleaningId }).from(cleaningAssignments).where(eq(cleaningAssignments.cleanerId, actor.id))
    : []
  return all.filter(cleaning => cleaning.apartment.managerId === actor.id || assigned.some(item => item.cleaningId === cleaning.id)).map(cleaning => {
    if (cleaning.apartment.managerId === actor.id) {
      return { ...cleaning, tariffSnapshot: { ownerTotalEur: cleaning.tariffSnapshot.ownerTotalEur } }
    }
    const { guestName: _guestName, guestPhone: _guestPhone, guestComment: _guestComment, cashAmountEur: _cashAmountEur, ...safeStay } = cleaning.stay
    return { ...cleaning, stay: safeStay, tariffSnapshot: { cleanerPoolEur: cleaning.tariffSnapshot.cleanerPoolEur } }
  })
}

export async function assignCleaners(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningAssignmentInputSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const assignees = await db.select().from(users).where(and(
    inArray(users.id, data.cleanerIds),
    eq(users.organizationId, actor.organizationId),
    eq(users.status, 'active')
  ))
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !user.roles.includes('cleaner'))) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей' })
  await db.transaction(async tx => {
    await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaningId))
    await tx.insert(cleaningAssignments).values(data.cleanerIds.map(cleanerId => ({ cleaningId, cleanerId })))
    await tx.update(cleanings).set({ status: 'assigned', scheduledOn: data.scheduledOn, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId))
  })
  await notifyUsers({ organizationId: actor.organizationId, userIds: data.cleanerIds, type: 'work_assigned', title: 'Назначена уборка', body: 'Вам назначена уборка', href: `/cleanings/${cleaningId}` })
  return { ok: true }
}

export async function completeCleaning(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'cleaner', 'administrator')
  const data = completionInputSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: true } })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (!['assigned', 'in_progress'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Уборку нельзя завершить в текущем статусе' })
  const completeChecklist = cleaning.checklist.every(required => data.checklist.some(item => item.label === required.label && item.checked))
  if (!completeChecklist || data.checklist.some(item => !item.checked)) throw createError({ statusCode: 400, statusMessage: 'Завершите обязательный чек-лист' })
  if (!actor.roles.includes('administrator')) {
    const assignment = await db.query.cleaningAssignments.findFirst({ where: and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id)) })
    if (!assignment) throw createError({ statusCode: 403, statusMessage: 'Уборка не назначена вам' })
  }
  const updated = await db.transaction(async tx => {
    const [completed] = await tx.update(cleanings).set({ status: 'completed', checklist: data.checklist, comment: data.comment, hasProblem: data.hasProblem, problemDescription: data.problemDescription, completedAt: new Date(), updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning()
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, type: 'cleaning_charge', visibility: 'manager', amountEur: cleaning.tariffSnapshot.ownerTotalEur, occurredOn: new Date().toISOString().slice(0, 10), description: 'Уборка', sourceType: 'cleaning', sourceId: cleaningId, createdById: actor.id }, tx as unknown as typeof db)
    return completed
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.completed', entityType: 'cleaning', entityId: cleaningId, payload: { hasProblem: data.hasProblem } })
  if (data.hasProblem) await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'problem', title: 'Проблема в уборке', body: data.problemDescription, href: `/cleanings/${cleaningId}` })
  return updated
}

export async function startCleaning(actor: Actor, cleaningId: string) {
  requireRole(actor, 'cleaner', 'administrator')
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (!actor.roles.includes('administrator')) {
    const assignment = await db.query.cleaningAssignments.findFirst({ where: and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id)) })
    if (!assignment) throw createError({ statusCode: 403, statusMessage: 'Уборка не назначена вам' })
  }
  if (!['assigned', 'in_progress'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Уборку нельзя начать в текущем статусе' })
  return (await db.update(cleanings).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning())[0]
}

export async function overrideCleaningTariff(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningTariffOverrideSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (cleaning.status === 'completed') throw createError({ statusCode: 409, statusMessage: 'Нельзя изменить тариф завершенной уборки' })
  const { reason, ...tariffSnapshot } = data
  const [updated] = await db.update(cleanings).set({ tariffSnapshot, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning()
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.tariff_overridden', entityType: 'cleaning', entityId: cleaningId, payload: { reason, before: cleaning.tariffSnapshot, after: tariffSnapshot } })
  return updated
}
