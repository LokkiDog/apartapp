import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or } from 'drizzle-orm'
import { cleaningAssignmentInputSchema, cleaningInputSchema, cleaningLinenUpdateSchema, cleaningRouteUpdateSchema, cleaningTariffOverrideSchema, cleaningUpdateSchema, completionInputSchema, workProgressInputSchema, type WorkListQuery } from '@contracts/crm'
import { canAccessAssignedWork, requireRole, requireWorkSectionAccess, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartments, attachments, cashTaskDetails, cleaningAssignments, cleanings, inventoryMovements, stays, tasks, users } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { createFinancialEntry } from '../finance/finance.service'
import { serializeApartment } from '../apartment/apartment-view'
import { deleteWorkRecord } from '../work/work-record.service'
import { canBeCleaningAssignee, cleaningTariffHasChanged } from '../work/work-policy'
import { applyCleaningInventoryReports, saveCleaningInventoryDrafts } from '../inventory/inventory.service'
import { calculateCleaningUrgency } from './cleaning-urgency'
import { buildCleaningChecklist, sofiaToday } from './checklist-template'
import { requireAcceptedCleaningAssignment } from './cleaning-acceptance'
import { cleaningProblemSummary, resolveCleaningProblems, syncCleaningProblems } from './cleaning-problem'
import { cleaningEventSnapshot, publishCleaningChange, publishCleaningChangeForId } from './cleaning-events'
import { captureCleaningGuestPreparation, linenPlanForCleaningFromStays, supersedeCleaningGuestPreparations } from './guest-preparation'
import { syncCashTaskForCleaning } from '../task/cash-task.service'

export async function createCleaning(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningInputSchema.parse(input)
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, data.apartmentId), eq(apartments.organizationId, actor.organizationId), eq(apartments.status, 'active')), with: { type: true } })
  if (!apartment) throw createError({ statusCode: 400, statusMessage: 'Апартамент не найден или неактивен' })
  let linkedCashAmount = 0
  if (data.stayId) {
    const stay = await db.query.stays.findFirst({ where: and(eq(stays.id, data.stayId), eq(stays.organizationId, actor.organizationId)) })
    if (!stay || stay.apartmentId !== data.apartmentId) throw createError({ statusCode: 400, statusMessage: 'Заезд не относится к выбранному апартаменту' })
    const existing = await db.query.cleanings.findFirst({ where: eq(cleanings.stayId, data.stayId) })
    if (existing) throw createError({ statusCode: 409, statusMessage: 'Для этого заезда уборка уже назначена' })
    linkedCashAmount = Number(stay.cashAmountEur ?? 0)
  }
  if (linkedCashAmount > 0 && data.cleanerIds.length && !data.cashAssigneeId) throw createError({ statusCode: 400, statusMessage: 'Выберите ответственного за наличные' })
  const assignees = data.cleanerIds.length ? await db.select().from(users).where(and(inArray(users.id, data.cleanerIds), eq(users.organizationId, actor.organizationId), eq(users.status, 'active'))) : []
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeCleaningAssignee(user.roles))) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
  const status = data.cleanerIds.length ? 'assigned' : 'unassigned'
  const isUrgent = data.urgencyOverride ?? await calculateCleaningUrgency(actor.organizationId, data.apartmentId, data.scheduledOn)
  const checklist = data.checklist?.map(item => ({ ...item })) ?? buildCleaningChecklist(apartment.type.defaultChecklist, apartment.additionalChecklist)
  const cleaning = await db.transaction(async tx => {
    const [created] = await tx.insert(cleanings).values({ organizationId: actor.organizationId, apartmentId: data.apartmentId, stayId: data.stayId ?? null, scheduledOn: data.scheduledOn, assignmentComment: data.assignmentComment ?? '', isUrgent, urgencyOverride: data.urgencyOverride ?? null, status, tariffSnapshot: { ownerTotalEur: data.ownerTotalEur, cleanerPoolEur: data.cleanerPoolEur, laundryEur: data.laundryEur, serviceEur: data.serviceEur }, checklist }).returning()
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
  await syncCashTaskForCleaning(actor, cleaning.id, data.cashAssigneeId)
  return cleaning
}

function cleaningCursor(value: string | undefined) {
  if (!value) return null
  const [scheduledOn, id, extra] = value.split('|')
  if (extra || !scheduledOn?.match(/^\d{4}-\d{2}-\d{2}$/) || !id?.match(/^[0-9a-f-]{36}$/i)) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный курсор' })
  }
  return { scheduledOn, id }
}

export async function listCleanings(actor: Actor, query: WorkListQuery = { view: 'all', limit: 50 }) {
  requireWorkSectionAccess(actor)
  const today = sofiaToday()
  const criteria = [eq(cleanings.organizationId, actor.organizationId)]
  if (query.view === 'operational') {
    criteria.push(or(
      gte(cleanings.scheduledOn, today),
      notInArray(cleanings.status, ['completed', 'canceled']),
      and(eq(cleanings.status, 'completed'), eq(cleanings.linenCollected, false))
    )!)
  }
  if (query.view === 'history') {
    criteria.push(and(lt(cleanings.scheduledOn, today), inArray(cleanings.status, ['completed', 'canceled']))!)
    const cursor = cleaningCursor(query.cursor)
    if (cursor) {
      criteria.push(or(
        lt(cleanings.scheduledOn, cursor.scheduledOn),
        and(eq(cleanings.scheduledOn, cursor.scheduledOn), lt(cleanings.id, cursor.id))
      )!)
    }
  }
  if (!actor.roles.includes('administrator') && !actor.roles.includes('specialist')) {
    const assigned = await db.select({ cleaningId: cleaningAssignments.cleaningId })
      .from(cleaningAssignments)
      .where(eq(cleaningAssignments.cleanerId, actor.id))
    if (!assigned.length) return query.view === 'history' ? { items: [], nextCursor: null } : []
    criteria.push(inArray(cleanings.id, assigned.map(item => item.cleaningId)))
  }
  const all = await db.query.cleanings.findMany({
    where: and(...criteria),
    with: { apartment: { with: { hotel: true, type: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } }, assignments: { with: { cleaner: { columns: { id: true, name: true } } } }, problems: true, guestPreparation: true, stay: true },
    orderBy: query.view === 'history' ? [desc(cleanings.scheduledOn), desc(cleanings.id)] : [asc(cleanings.scheduledOn), asc(cleanings.id)],
    limit: query.view === 'history' ? query.limit + 1 : undefined
  })
  const hasNextPage = query.view === 'history' && all.length > query.limit
  const page = hasNextPage ? all.slice(0, query.limit) : all
  const problemIds = page.flatMap(cleaning => cleaning.problems.map(problem => problem.id))
  const problemAttachments = problemIds.length ? await db.select({ id: attachments.id, entityId: attachments.entityId, fileName: attachments.fileName }).from(attachments).where(and(eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, problemIds))).orderBy(asc(attachments.createdAt), asc(attachments.id)) : []
  const apartmentIds = [...new Set(page.map(item => item.apartmentId))]
  const futureStays = apartmentIds.length
    ? await db.query.stays.findMany({
        where: and(eq(stays.organizationId, actor.organizationId), gte(stays.checkInOn, today), inArray(stays.apartmentId, apartmentIds)),
        columns: { id: true, apartmentId: true, checkInOn: true, adultCount: true, childCount: true },
        orderBy: [asc(stays.checkInOn)]
      })
    : []
  const cashAssignees = actor.roles.includes('administrator') && page.length
    ? await db.select({ cleaningId: cashTaskDetails.cleaningId, assigneeId: tasks.assigneeId })
      .from(cashTaskDetails)
      .innerJoin(tasks, eq(tasks.id, cashTaskDetails.taskId))
      .where(and(
        eq(cashTaskDetails.organizationId, actor.organizationId),
        inArray(cashTaskDetails.cleaningId, page.map(cleaning => cleaning.id))
      ))
    : []
  const staysByApartment = new Map<string, typeof futureStays>()
  for (const stay of futureStays) staysByApartment.set(stay.apartmentId, [...(staysByApartment.get(stay.apartmentId) ?? []), stay])
  const attachmentsByProblem = new Map<string, typeof problemAttachments>()
  for (const attachment of problemAttachments) attachmentsByProblem.set(attachment.entityId, [...(attachmentsByProblem.get(attachment.entityId) ?? []), attachment])
  const cashAssigneeByCleaning = new Map(cashAssignees.map(item => [item.cleaningId, item.assigneeId]))
  const linenPlan = (cleaning: (typeof page)[number]) => linenPlanForCleaningFromStays(cleaning, staysByApartment.get(cleaning.apartmentId) ?? [])
  const serializeCleaning = (cleaning: (typeof page)[number]) => ({ ...cleaning, linenPlan: linenPlan(cleaning), problems: cleaning.problems.map(problem => ({ ...problem, attachments: attachmentsByProblem.get(problem.id) ?? [] })), apartment: serializeApartment(cleaning.apartment) })
  let serialized
  if (actor.roles.includes('administrator')) serialized = page.map(cleaning => ({ ...serializeCleaning(cleaning), cashAssigneeId: cashAssigneeByCleaning.get(cleaning.id) ?? null }))
  else if (actor.roles.includes('specialist')) serialized = page.map(cleaning => ({
    id: cleaning.id,
    apartmentId: cleaning.apartmentId,
    status: cleaning.status,
    scheduledOn: cleaning.scheduledOn,
    isUrgent: cleaning.isUrgent,
    checklist: cleaning.checklist,
    startedAt: cleaning.startedAt,
    completedAt: cleaning.completedAt,
    linenCollected: cleaning.linenCollected,
    linenPlan: linenPlan(cleaning),
    assignments: cleaning.assignments.map(assignment => ({
      cleanerId: assignment.cleanerId,
      routePosition: assignment.routePosition,
      acceptedAt: assignment.acceptedAt,
      cleaner: { id: assignment.cleaner.id, name: assignment.cleaner.name }
    })),
    apartment: {
      id: cleaning.apartment.id,
      name: cleaning.apartment.name,
      building: cleaning.apartment.building,
      locationDetails: cleaning.apartment.locationDetails,
      instructions: cleaning.apartment.instructions,
      hotel: {
        id: cleaning.apartment.hotel.id,
        name: cleaning.apartment.hotel.name,
        address: cleaning.apartment.hotel.address,
        latitude: cleaning.apartment.hotel.latitude,
        longitude: cleaning.apartment.hotel.longitude
      }
    }
  }))
  else serialized = page.map(cleaning => {
    const apartment = serializeApartment(cleaning.apartment)
    const safeStay = cleaning.stay ? (({ guestName: _guestName, guestPhone: _guestPhone, guestComment: _guestComment, cashAmountEur: _cashAmountEur, ...rest }) => rest)(cleaning.stay) : null
    return { ...serializeCleaning(cleaning), apartment, stay: safeStay, tariffSnapshot: { cleanerPoolEur: cleaning.tariffSnapshot.cleanerPoolEur } }
  })
  if (query.view !== 'history') return serialized
  const last = page.at(-1)
  return {
    items: serialized,
    nextCursor: hasNextPage && last ? `${last.scheduledOn}|${last.id}` : null
  }
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
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeCleaningAssignee(user.roles))) throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
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
    await tx.update(cleanings).set({ status: 'assigned', scheduledOn: data.scheduledOn, ...(data.assignmentComment === undefined ? {} : { assignmentComment: data.assignmentComment }), updatedAt: new Date() }).where(eq(cleanings.id, cleaningId))
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
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: { with: { type: true } }, problems: true } })
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
    await captureCleaningGuestPreparation(tx, { cleaningId, organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, scheduledOn: cleaning.scheduledOn, defaultLinenGuestCount: cleaning.apartment.type.defaultLinenGuestCount })
    const [completed] = await tx.update(cleanings).set({ status: 'completed', checklist: data.checklist, comment: data.comment, hasProblem: problems.length > 0, problemDescription, completedAt: new Date(), updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning()
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, type: 'cleaning_charge', visibility: 'manager', amountEur: cleaning.tariffSnapshot.ownerTotalEur, occurredOn: new Date().toISOString().slice(0, 10), description: 'Уборка', sourceType: 'cleaning', sourceId: cleaningId, createdById: actor.id }, tx as unknown as typeof db)
    return completed
  })
  await Promise.allSettled(removedStorageKeys.map(storageKey => fileStorage.remove(storageKey)))
  await supersedeCleaningGuestPreparations(actor, cleaning.apartmentId, cleaningId)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.completed', entityType: 'cleaning', entityId: cleaningId, payload: { problemCount: problems.length } })
  if (problems.length) {
    const administrators = await administratorsForOrganization(actor.organizationId)
    await Promise.all(problems.map(problem => notifyUsers({ organizationId: actor.organizationId, userIds: administrators, type: 'problem', title: 'Проблема в уборке', body: problem.description, href: `/problems?problemId=${problem.id}` })))
  }
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
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)), with: { apartment: { columns: { automaticLinenCollection: true } } } })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  await requireAcceptedCleaningAssignment(actor, cleaningId)
  if (!['assigned', 'in_progress'].includes(cleaning.status)) throw createError({ statusCode: 409, statusMessage: 'Уборку нельзя начать в текущем статусе' })
  if (cleaning.status === 'in_progress') return cleaning
  const startedAt = new Date()
  const [updated] = await db.update(cleanings)
    .set({ status: 'in_progress', startedAt, linenCollected: cleaning.apartment.automaticLinenCollection ? true : cleaning.linenCollected, updatedAt: startedAt })
    .where(and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId), eq(cleanings.status, 'assigned')))
    .returning()
  if (!updated) {
    return await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) }) ?? cleaning
  }
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.started', entityType: 'cleaning', entityId: cleaningId })
  await publishCleaningChangeForId(actor, cleaningId, 'started')
  return updated
}

export async function updateCleaningLinen(actor: Actor, cleaningId: string, input: unknown) {
  const data = cleaningLinenUpdateSchema.parse(input)
  const cleaning = await db.query.cleanings.findFirst({
    where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)),
    with: { assignments: true }
  })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  const canUpdate = actor.roles.includes('administrator')
    || actor.roles.includes('specialist')
    || cleaning.assignments.some(assignment => canAccessAssignedWork(actor, assignment.cleanerId))
  if (!canUpdate) throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  const [updated] = await db.update(cleanings)
    .set({ linenCollected: data.collected, updatedAt: new Date() })
    .where(and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)))
    .returning({ linenCollected: cleanings.linenCollected })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Не удалось обновить отметку белья' })
  await publishCleaningChangeForId(actor, cleaningId, 'linen')
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
  if (assignees.length !== data.cleanerIds.length || assignees.some(user => !canBeCleaningAssignee(user.roles))) {
    throw createError({ statusCode: 400, statusMessage: 'Исполнитель должен быть активной уборщицей или администратором' })
  }

  const { cleanerIds, scheduledOn, reason, apartmentId, stayId, checklist, urgencyOverride, cashAssigneeId, assignmentComment, ...tariffSnapshot } = data
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
    return (await tx.update(cleanings).set({ apartmentId: nextApartmentId, stayId: nextStayId ?? null, scheduledOn, ...(assignmentComment === undefined ? {} : { assignmentComment }), isUrgent, urgencyOverride: nextUrgencyOverride, tariffSnapshot, checklist: checklist ?? cleaning.checklist, status, updatedAt: new Date() }).where(eq(cleanings.id, cleaningId)).returning())[0]
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
  await syncCashTaskForCleaning(actor, cleaningId, cashAssigneeId)
  return updated
}

export async function reorderCleaningRoute(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  const data = cleaningRouteUpdateSchema.parse(input)
  const cleaner = await db.query.users.findFirst({ where: and(eq(users.id, data.cleanerId), eq(users.organizationId, actor.organizationId), eq(users.status, 'active')) })
  if (!cleaner || !canBeCleaningAssignee(cleaner.roles)) throw createError({ statusCode: 400, statusMessage: 'Исполнитель не найден' })
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
  await syncCashTaskForCleaning(actor, cleaningId, null)
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
