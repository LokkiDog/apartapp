import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { cleaningAssignmentInputSchema, cleaningInputSchema, cleaningRouteUpdateSchema, cleaningTariffOverrideSchema, cleaningUpdateSchema, completionInputSchema, workProgressInputSchema } from '@contracts/crm'
import { requireRole, requireWorkSectionAccess, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cleaningAssignments, cleanings, inventoryMovements, stays, users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'
import { serializeApartment } from '../apartment/apartment-view'
import { deleteWorkRecord } from '../work/work-record.service'
import { canBeWorkAssignee, cleaningTariffHasChanged } from '../work/work-policy'
import { applyCleaningInventoryReports, saveCleaningInventoryDrafts } from '../inventory/inventory.service'
import { calculateCleaningUrgency } from './cleaning-urgency'
import { buildCleaningChecklist } from './checklist-template'
import { requireAcceptedCleaningAssignment } from './cleaning-acceptance'
import { cleaningProblemSummary, resolveCleaningProblems, syncCleaningProblems } from './cleaning-problem'
import { cleaningEventSnapshot, publishCleaningChange, publishCleaningChangeForId } from './cleaning-events'

export async function createCleaning(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningInputSchema.parse(input)
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, data.apartmentId), eq(apartments.organizationId, actor.organizationId), eq(apartments.status, 'active')), with: { type: true } })
  if (!apartment) throw createError({ statusCode: 400, statusMessage: 'Апартамент не найден или неактивен' })
  if (data.stayId) {
    const stay = await db.query.stays.findFirst({ where: and(eq(stays.id, data.stayId), eq(stays.organizationId, actor.organizationId)) })
    if (!stay || stay.apartmentId !== data.apartmentId) throw createError({ statusCode: 400, statusMessage: 'Заезд не относится к выбранному апартаменту' })
    const existing = await db.query.cleanings.findFirst({ where: eq(cleanings.stayId, data.stayId) })
    if (existing) throw createError({ statusCode: 409, statusMessage: 'Для этого заезда уборка уже назначена' })
  }
  const assignees = data.cleanerIds.length ? await db.select().from(users).where(and(inArray(users.id, data.cleanerIds), eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))) : []
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeWorkAssignee(user.roles))) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
  const status = data.cleanerIds.length ? 'assigned' : 'unassigned'
  const isUrgent = data.urgencyOverride ?? await calculateCleaningUrgency(actor.organizationId, data.apartmentId, data.scheduledOn)
  const checklist = data.checklist?.map(item => ({ ...item })) ?? buildCleaningChecklist(apartment.type.defaultChecklist, apartment.additionalChecklist)
  const cleaning = await db.transaction(async tx => {
    const [created] = await tx.insert(cleanings).values({ organizationId: actor.organizationId, apartmentId: data.apartmentId, stayId: data.stayId ?? null, scheduledOn: data.scheduledOn, isUrgent, urgencyOverride: data.urgencyOverride ?? null, status, tariffSnapshot: { ownerTotalEur: data.ownerTotalEur, cleanerPoolEur: data.cleanerPoolEur, laundryEur: data.laundryEur, serviceEur: data.serviceEur }, checklist }).returning()
    if (!created) throw createError({ statusCode: 500, statusMessage: 'Не удалось создать уборку' })
    for (const cleanerId of data.cleanerIds) {
      const occupied = await tx.select({ routePosition: cleaningAssignments.routePosition }).from(cleaningAssignments).innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id)).where(and(eq(cleaningAssignments.cleanerId, cleanerId), eq(cleanings.scheduledOn, data.scheduledOn)))
      const routePosition = occupied.reduce((max, row) => Math.max(max, row.routePosition), -1) + 1
      await tx.insert(cleaningAssignments).values({ cleaningId: created.id, cleanerId, routePosition })
    }
    return created
  })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.created', entityType: 'cleaning', entityId: cleaning.id, payload: { stayId: data.stayId ?? null } })
  const eventSnapshot = await cleaningEventSnapshot(cleaning.id)
  if (eventSnapshot) await publishCleaningChange({ actor, after: eventSnapshot, reason: 'created' })
  return cleaning
}

export async function listCleanings(actor: Actor) {
  requireWorkSectionAccess(actor)
  const all = await db.query.cleanings.findMany({
    where: eq(cleanings.organizationId, actor.organizationId),
    with: { apartment: { with: { hotel: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } }, assignments: { with: { cleaner: true } }, problems: true, stay: true },
    orderBy: (cleanings, { asc }) => [asc(cleanings.scheduledOn)]
  })
  const problemIds = all.flatMap(cleaning => cleaning.problems.map(problem => problem.id))
  const problemAttachments = problemIds.length ? await db.select({ id: attachments.id, entityId: attachments.entityId, fileName: attachments.fileName }).from(attachments).where(and(eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, problemIds))).orderBy(asc(attachments.createdAt), asc(attachments.id)) : []
  const serializeCleaning = (cleaning: (typeof all)[number]) => ({ ...cleaning, problems: cleaning.problems.map(problem => ({ ...problem, attachments: problemAttachments.filter(attachment => attachment.entityId === problem.id) })), apartment: serializeApartment(cleaning.apartment) })
  if (actor.roles.includes('administrator')) return all.map(serializeCleaning)
  return all.filter(cleaning => cleaning.assignments.some(item => item.cleanerId === actor.id)).map(cleaning => {
    const apartment = serializeApartment(cleaning.apartment)
    const safeStay = cleaning.stay ? (({ guestName: _guestName, guestPhone: _guestPhone, guestComment: _guestComment, cashAmountEur: _cashAmountEur, ...rest }) => rest)(cleaning.stay) : null
    return { ...serializeCleaning(cleaning), apartment, stay: safeStay, tariffSnapshot: { cleanerPoolEur: cleaning.tariffSnapshot.cleanerPoolEur } }
  })
}

export async function assignCleaners(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningAssignmentInputSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({
    where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)),
    with: { assignments: true }
  })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const beforeEvent = await cleaningEventSnapshot(cleaningId)
  const assignees = await db.select().from(users).where(and(
    inArray(users.id, data.cleanerIds),
    eq(users.organizationId, actor.organizationId),
    eq(users.status, 'active')
  ))
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeWorkAssignee(user.roles))) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
  await db.transaction(async tx => {
    const positions = new Map<string, number>()
    for (const cleanerId of data.cleanerIds) {
      const occupied = await tx.select({ routePosition: cleaningAssignments.routePosition })
        .from(cleaningAssignments)
        .innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id))
        .where(and(eq(cleaningAssignments.cleanerId, cleanerId), eq(cleanings.scheduledOn, data.scheduledOn), ne(cleaningAssignments.cleaningId, cleaningId)))
      positions.set(cleanerId, occupied.reduce((max, row) => Math.max(max, row.routePosition), -1) + 1)
    }
    await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaningId))
    await tx.insert(cleaningAssignments).values(data.cleanerIds.map(cleanerId => ({
      cleaningId,
      cleanerId,
      routePosition: positions.get(cleanerId) ?? 0,
      acceptedAt: cleaning.assignments.find(assignment => assignment.cleanerId === cleanerId)?.acceptedAt ?? null
    })))
    await tx.update(cleanings).set({ status: 'assigned', scheduledOn: data.scheduledOn, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId))
  })
  const afterEvent = await cleaningEventSnapshot(cleaningId)
  if (beforeEvent && afterEvent) await publishCleaningChange({ actor, before: beforeEvent, after: afterEvent, reason: 'updated' })
  return { ok: true }
}

export async function acceptCleaning(actor: Actor, cleaningId: string) {
  requireRole(actor, 'cleaner', 'administrator')
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (!['assigned', 'in_progress'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Уборку нельзя принять в текущем статусе' })

  const assignment = await db.query.cleaningAssignments.findFirst({ where: and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id)) })
  if (!assignment) throw createError({ statusCode: 403, statusMessage: 'Уборка не назначена вам' })

  let acceptedAt = assignment.acceptedAt
  if (!assignment.acceptedAt) {
    const attemptedAt = new Date()
    const [accepted] = await db.update(cleaningAssignments)
      .set({ acceptedAt: attemptedAt })
      .where(and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id), isNull(cleaningAssignments.acceptedAt)))
      .returning({ acceptedAt: cleaningAssignments.acceptedAt })
    if (accepted) {
      acceptedAt = accepted.acceptedAt
      await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.accepted', entityType: 'cleaning', entityId: cleaningId })
      await publishCleaningChangeForId(actor, cleaningId, 'accepted')
    } else {
      acceptedAt = (await db.query.cleaningAssignments.findFirst({
        where: and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id)),
        columns: { acceptedAt: true }
      }))?.acceptedAt ?? attemptedAt
    }
  }
  return { ok: true, acceptedAt }
}

export async function completeCleaning(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'cleaner', 'administrator')
  const data = completionInputSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: true, problems: true } })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const beforeEvent = await cleaningEventSnapshot(cleaningId)
  if (cleaning.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Сначала начните уборку' })
  const completeChecklist = cleaning.checklist.every(required => data.checklist.some(item => item.label === required.label && item.checked))
  if (!completeChecklist || data.checklist.some(item => !item.checked)) throw createError({ statusCode: 400, statusMessage: 'Завершите обязательный чек-лист' })
  await requireAcceptedCleaningAssignment(actor, cleaningId)
  let removedStorageKeys: string[] = []
  const problems = resolveCleaningProblems(input, data, cleaning.problems)
  const problemDescription = cleaningProblemSummary(problems)
  const updated = await db.transaction(async tx => {
    await applyCleaningInventoryReports(tx, actor, cleaning, data.inventoryReports)
    removedStorageKeys = await syncCleaningProblems(tx, actor, cleaningId, cleaning.apartmentId, problems)
    const [completed] = await tx.update(cleanings).set({ status: 'completed', checklist: data.checklist, comment: data.comment, hasProblem: problems.length > 0, problemDescription, completedAt: new Date(), updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning()
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, type: 'cleaning_charge', visibility: 'manager', amountEur: cleaning.tariffSnapshot.ownerTotalEur, occurredOn: new Date().toISOString().slice(0, 10), description: 'Уборка', sourceType: 'cleaning', sourceId: cleaningId, createdById: actor.id }, tx as unknown as typeof db)
    return completed
  })
  await Promise.allSettled(removedStorageKeys.map(storageKey => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.completed', entityType: 'cleaning', entityId: cleaningId, payload: { problemCount: problems.length } })
  if (problems.length) await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'problem', title: 'Проблема в уборке', body: problemDescription, href: `/cleanings/${cleaningId}` })
  const afterEvent = await cleaningEventSnapshot(cleaningId)
  if (beforeEvent && afterEvent) await publishCleaningChange({ actor, before: beforeEvent, after: afterEvent, reason: 'completed' })
  return updated
}

export async function saveCleaningProgress(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'cleaner', 'administrator')
  const data = workProgressInputSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: true, problems: true } })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (cleaning.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Сначала начните уборку' })
  await requireAcceptedCleaningAssignment(actor, cleaningId)
  let removedStorageKeys: string[] = []
  const problems = resolveCleaningProblems(input, data, cleaning.problems)
  const problemDescription = cleaningProblemSummary(problems)
  const updated = await db.transaction(async tx => {
    if (data.inventoryReports) await saveCleaningInventoryDrafts(tx, actor, cleaning, data.inventoryReports)
    removedStorageKeys = await syncCleaningProblems(tx, actor, cleaningId, cleaning.apartmentId, problems)
    const [saved] = await tx.update(cleanings).set({ checklist: data.checklist, comment: data.comment, hasProblem: problems.length > 0, problemDescription, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning()
    return saved
  })
  await Promise.allSettled(removedStorageKeys.map(storageKey => fileStorage.remove(storageKey)))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.progress_saved', entityType: 'cleaning', entityId: cleaningId })
  await publishCleaningChangeForId(actor, cleaningId, 'progress')
  return updated
}

export async function startCleaning(actor: Actor, cleaningId: string) {
  requireRole(actor, 'cleaner', 'administrator')
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  await requireAcceptedCleaningAssignment(actor, cleaningId)
  if (!['assigned', 'in_progress'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Уборку нельзя начать в текущем статусе' })
  if (cleaning.status === 'in_progress') return cleaning
  const startedAt = new Date()
  const [updated] = await db.update(cleanings)
    .set({ status: 'in_progress', startedAt, updatedAt: startedAt })
    .where(and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId), eq(cleanings.status, 'assigned')))
    .returning()
  if (!updated) {
    return await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) }) ?? cleaning
  }
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.started', entityType: 'cleaning', entityId: cleaningId })
  await publishCleaningChangeForId(actor, cleaningId, 'started')
  return updated
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
  await publishCleaningChangeForId(actor, cleaningId, 'tariff')
  return updated
}

export async function updateCleaning(actor: Actor, cleaningId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningUpdateSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({
    where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)),
    with: { assignments: true }
  })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const beforeEvent = await cleaningEventSnapshot(cleaningId)
  if (['completed', 'canceled'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Завершенную или отмененную уборку нельзя изменить' })
  if (cleaning.status === 'in_progress' && !data.cleanerIds.length) throw createError({ statusCode: 409, statusMessage: 'У начатой уборки должен остаться хотя бы один исполнитель' })

  const assignees = data.cleanerIds.length
    ? await db.select().from(users).where(and(
        inArray(users.id, data.cleanerIds),
        eq(users.organizationId, actor.organizationId),
        eq(users.status, 'active')
      ))
    : []
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeWorkAssignee(user.roles))) {
    throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
  }

  const { cleanerIds, scheduledOn, reason, apartmentId, stayId, checklist, urgencyOverride, ...tariffSnapshot } = data
  const nextApartmentId = apartmentId ?? cleaning.apartmentId
  const nextStayId = stayId === undefined ? cleaning.stayId : stayId
  const contextChanged = nextApartmentId !== cleaning.apartmentId || nextStayId !== cleaning.stayId
  if (cleaning.status === 'in_progress' && contextChanged) throw createError({ statusCode: 409, statusMessage: 'Начатую уборку нельзя перепривязать' })
  if (checklist && cleaning.status === 'in_progress' && JSON.stringify(checklist) !== JSON.stringify(cleaning.checklist)) throw createError({ statusCode: 409, statusMessage: 'Чек-лист начатой уборки нельзя изменить' })
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, nextApartmentId), eq(apartments.organizationId, actor.organizationId), eq(apartments.status, 'active')) })
  if (!apartment) throw createError({ statusCode: 400, statusMessage: 'Апартамент не найден или неактивен' })
  if (nextStayId) {
    const stay = await db.query.stays.findFirst({ where: and(eq(stays.id, nextStayId), eq(stays.organizationId, actor.organizationId)) })
    if (!stay || stay.apartmentId !== nextApartmentId) throw createError({ statusCode: 400, statusMessage: 'Заезд не относится к выбранному апартаменту' })
    const duplicate = await db.query.cleanings.findFirst({ where: and(eq(cleanings.stayId, nextStayId), ne(cleanings.id, cleaningId)) })
    if (duplicate) throw createError({ statusCode: 409, statusMessage: 'Для этого заезда уборка уже назначена' })
  }
  if (nextApartmentId !== cleaning.apartmentId) {
    const movement = await db.query.inventoryMovements.findFirst({ where: and(eq(inventoryMovements.sourceType, 'cleaning'), eq(inventoryMovements.sourceId, cleaningId)) })
    if (movement) throw createError({ statusCode: 409, statusMessage: 'Апартамент нельзя изменить после списания расходников' })
  }
  const tariffChanged = cleaningTariffHasChanged(cleaning.tariffSnapshot, tariffSnapshot)
  if (tariffChanged && reason.length < 3) throw createError({ statusCode: 400, statusMessage: 'Укажите причину изменения тарифа' })

  const previousCleanerIds = cleaning.assignments.map(assignment => assignment.cleanerId)
  const status = cleaning.status === 'in_progress' ? 'in_progress' : cleanerIds.length ? 'assigned' : 'unassigned'
  const nextUrgencyOverride = urgencyOverride === undefined ? cleaning.urgencyOverride : urgencyOverride
  const isUrgent = nextUrgencyOverride ?? await calculateCleaningUrgency(actor.organizationId, nextApartmentId, scheduledOn)
  const updated = await db.transaction(async tx => {
    const positions = new Map<string, number>()
    for (const cleanerId of cleanerIds) {
      const previous = previousCleanerIds.includes(cleanerId) && scheduledOn === cleaning.scheduledOn
        ? cleaning.assignments.find(assignment => assignment.cleanerId === cleanerId)?.routePosition
        : undefined
      if (previous !== undefined) {
        positions.set(cleanerId, previous)
        continue
      }
      const occupied = await tx.select({ routePosition: cleaningAssignments.routePosition })
        .from(cleaningAssignments)
        .innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id))
        .where(and(eq(cleaningAssignments.cleanerId, cleanerId), eq(cleanings.scheduledOn, scheduledOn), ne(cleaningAssignments.cleaningId, cleaningId)))
      positions.set(cleanerId, occupied.reduce((max, row) => Math.max(max, row.routePosition), -1) + 1)
    }
    await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaningId))
    if (cleanerIds.length) await tx.insert(cleaningAssignments).values(cleanerIds.map(cleanerId => ({
      cleaningId,
      cleanerId,
      routePosition: positions.get(cleanerId) ?? 0,
      acceptedAt: cleaning.assignments.find(assignment => assignment.cleanerId === cleanerId)?.acceptedAt ?? null
    })))
    return (await tx.update(cleanings).set({ apartmentId: nextApartmentId, stayId: nextStayId ?? null, scheduledOn, isUrgent, urgencyOverride: nextUrgencyOverride, tariffSnapshot, checklist: checklist ?? cleaning.checklist, status, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning())[0]
  })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить уборку' })

  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: 'cleaning.updated',
    entityType: 'cleaning',
    entityId: cleaningId,
    payload: tariffChanged ? { reason, before: cleaning.tariffSnapshot, after: tariffSnapshot } : undefined
  })
  const afterEvent = await cleaningEventSnapshot(cleaningId)
  if (beforeEvent && afterEvent) await publishCleaningChange({ actor, before: beforeEvent, after: afterEvent, reason: 'updated' })
  return updated
}

export async function reorderCleaningRoute(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningRouteUpdateSchema.parse(input)
  const cleaner = await db.query.users.findFirst({ where: and(eq(users.id, data.cleanerId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
  if (!cleaner || !canBeWorkAssignee(cleaner.roles)) throw createError({ statusCode: 400, statusMessage: 'Исполнитель не найден' })
  const rows = await db.query.cleanings.findMany({ where: and(eq(cleanings.organizationId, actor.organizationId), eq(cleanings.scheduledOn, data.scheduledOn)), with: { assignments: true } })
  const selected = rows.filter(cleaning => data.cleaningIds.includes(cleaning.id))
  if (selected.length !== data.cleaningIds.length || selected.some(cleaning => ['completed', 'canceled'].includes(cleaning.status) || !cleaning.assignments.some(assignment => assignment.cleanerId === data.cleanerId))) {
    throw createError({ statusCode: 400, statusMessage: 'Маршрут содержит недоступную уборку' })
  }
  await db.transaction(async tx => {
    for (const [routePosition, cleaningId] of data.cleaningIds.entries()) {
      await tx.update(cleaningAssignments).set({ routePosition }).where(and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, data.cleanerId)))
    }
  })
  await Promise.all(data.cleaningIds.map(cleaningId => publishCleaningChangeForId(actor, cleaningId, 'route')))
  return { ok: true }
}

export async function deleteCleaning(actor: Actor, cleaningId: string, input?: unknown) {
  requireRole(actor, 'administrator')
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { problems: true } })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const disposition = input && typeof input === 'object' && 'problemDisposition' in input ? (input as { problemDisposition?: unknown }).problemDisposition : undefined
  if (cleaning.problems.length && !['preserve', 'delete'].includes(String(disposition))) {
    throw createError({ statusCode: 409, statusMessage: 'Выберите, сохранить или удалить связанные проблемы', data: { problemCount: cleaning.problems.length } })
  }
  const beforeEvent = await cleaningEventSnapshot(cleaningId)
  await deleteWorkRecord('cleaning', cleaningId, { deleteProblems: disposition === 'delete' })
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.deleted', entityType: 'cleaning', entityId: cleaningId, payload: { problemDisposition: cleaning.problems.length ? disposition : null } })
  if (beforeEvent) await publishCleaningChange({ actor, before: beforeEvent, reason: 'deleted' })
  return { ok: true }
}
