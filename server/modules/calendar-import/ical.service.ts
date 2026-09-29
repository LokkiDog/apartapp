import { and, eq, inArray, isNotNull, lt, gt, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole, canManageApartment, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartments, apartmentManagers, attachments, cashTaskDetails, cleaningAssignments, cleaningProblems, cleaningInventoryReports, cleanings, consumables, icalConflicts, icalFeeds, financialEntries, inventoryMovements, stays, tasks } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { fetchIcal } from './ical'
import { publishCleaningChangeForId } from '../cleaning/cleaning-events'
import { syncCashTasksForStay } from '../task/cash-task.service'
import { reconcileCleaningGuestPreparation } from '../cleaning/guest-preparation'

const feedInput = z.object({ url: z.union([z.url(), z.literal('')]) })
const decisionInput = z.object({ decision: z.enum(['same', 'different', 'keep_aparts']), targetCleaningId: z.uuid().optional() })
const guestCountInput = z.object({ adultCount: z.number().int().min(1).max(50), childCount: z.number().int().min(0).max(50) })
const runningFeeds = new Set<string>()

export async function listIcalFeeds(actor: Actor) {
  requireRole(actor, 'administrator', 'manager')
  const rows = await db.query.icalFeeds.findMany({
    where: eq(icalFeeds.organizationId, actor.organizationId),
    with: { apartment: { with: { hotel: true, managerAssignments: { with: { manager: { columns: { id: true, name: true } } } } } } }
  })
  return rows.filter(row => actor.roles.includes('administrator') || row.apartment.managerAssignments.some(item => item.userId === actor.id)).map(row => ({
    id: row.id, apartmentId: row.apartmentId, apartmentName: row.apartment.name, hotelName: row.apartment.hotel.name,
    url: row.url, enabled: row.enabled, lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null, lastError: row.lastError
  }))
}

export async function configureIcalFeed(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  if (!(await canManageApartment(actor, apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  const data = feedInput.parse(input)
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  const existing = await db.query.icalFeeds.findFirst({ where: and(eq(icalFeeds.apartmentId, apartmentId), eq(icalFeeds.organizationId, actor.organizationId)) })
  if (!data.url) {
    if (existing) await db.update(icalFeeds).set({ enabled: false, updatedAt: new Date() }).where(eq(icalFeeds.id, existing.id))
    return { ok: true }
  }
  const values = { url: data.url, enabled: true, lastError: '', updatedAt: new Date() }
  const [feed] = existing
    ? await db.update(icalFeeds).set(values).where(eq(icalFeeds.id, existing.id)).returning()
    : await db.insert(icalFeeds).values({ organizationId: actor.organizationId, apartmentId, createdById: actor.id, ...values }).returning()
  if (feed) await syncIcalFeed(feed.id)
  return { ok: true }
}

async function reportConflict(conflictId: string) {
  const conflict = await db.query.icalConflicts.findFirst({ where: eq(icalConflicts.id, conflictId), with: { apartment: { with: { managerAssignments: { columns: { userId: true } } } } } })
  if (!conflict) return
  const ids = conflict.apartment.managerAssignments.map(assignment => assignment.userId)
  await notifyUsers({ organizationId: conflict.organizationId, userIds: ids, type: 'stay_conflict', title: 'Конфликт бронирований', body: `${conflict.apartment.name} · выберите, какое бронирование оставить`, href: `/calendar?icalConflict=${conflict.id}` })
}

async function recordConflicts(importedStayId: string, organizationId: string, apartmentId: string) {
  const imported = await db.query.stays.findFirst({ where: and(eq(stays.id, importedStayId), eq(stays.organizationId, organizationId)) })
  if (!imported) return
  const overlaps = await db.query.stays.findMany({ where: and(
    eq(stays.organizationId, organizationId), eq(stays.apartmentId, apartmentId), eq(stays.state, 'active'), ne(stays.id, importedStayId),
    lt(stays.checkInOn, imported.checkOutOn), gt(stays.checkOutOn, imported.checkInOn)
  ) })
  for (const existing of overlaps) {
    const [created] = await db.insert(icalConflicts).values({ organizationId, apartmentId, importedStayId, existingStayId: existing.id }).onConflictDoNothing().returning()
    if (created) await reportConflict(created.id)
  }
}

export async function syncIcalFeed(feedId: string) {
  if (runningFeeds.has(feedId)) return { skipped: true }
  runningFeeds.add(feedId)
  try {
    const feed = await db.query.icalFeeds.findFirst({ where: and(eq(icalFeeds.id, feedId), eq(icalFeeds.enabled, true)) })
    if (!feed) return { skipped: true }
    try {
      const events = await fetchIcal(feed.url)
      const incoming = new Map(events.map(event => [event.uid, event]))
      const existingRows = await db.query.stays.findMany({ where: and(eq(stays.icalFeedId, feed.id), isNotNull(stays.icalUid)) })
      for (const event of events) {
        const existing = existingRows.find(row => row.icalUid === event.uid)
        if (existing) {
          const datesChanged = existing.checkInOn !== event.checkInOn || existing.checkOutOn !== event.checkOutOn
          const [updated] = await db.update(stays).set({ checkInOn: event.checkInOn, checkOutOn: event.checkOutOn, icalSummary: event.summary, icalMissingCount: 0, state: datesChanged && existing.state === 'hidden' ? 'active' : existing.state, updatedAt: new Date() }).where(eq(stays.id, existing.id)).returning()
          if (updated && datesChanged && updated.state === 'active') await recordConflicts(updated.id, feed.organizationId, feed.apartmentId)
        } else {
          const [created] = await db.insert(stays).values({ organizationId: feed.organizationId, apartmentId: feed.apartmentId, checkInOn: event.checkInOn, checkOutOn: event.checkOutOn, adultCount: null, childCount: null, guestName: '', guestPhone: '', guestComment: '', cashAmountEur: null, createdById: null, source: 'ical', state: 'active', icalFeedId: feed.id, icalUid: event.uid, icalSummary: event.summary }).onConflictDoNothing().returning()
          if (created) await recordConflicts(created.id, feed.organizationId, feed.apartmentId)
        }
      }
      for (const row of existingRows) {
        if (row.state !== 'active' || incoming.has(row.icalUid ?? '')) continue
        const missing = row.icalMissingCount + 1
        await db.update(stays).set({ icalMissingCount: missing, ...(missing >= 2 ? { state: 'canceled' as const } : {}), updatedAt: new Date() }).where(eq(stays.id, row.id))
        if (missing >= 2) await cancelUnstartedCleaning(row.id, feed.organizationId)
      }
      await db.update(icalFeeds).set({ lastSyncedAt: new Date(), lastError: '', updatedAt: new Date() }).where(eq(icalFeeds.id, feed.id))
      return { ok: true, eventCount: events.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить календарь'
      await db.update(icalFeeds).set({ lastError: message.slice(0, 300), updatedAt: new Date() }).where(eq(icalFeeds.id, feed.id))
      return { ok: false, error: message }
    }
  } finally {
    runningFeeds.delete(feedId)
  }
}

async function cancelUnstartedCleaning(stayId: string, organizationId: string) {
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.stayId, stayId), eq(cleanings.organizationId, organizationId), inArray(cleanings.status, ['unassigned', 'assigned'])) })
  if (!cleaning) { await notifyCleaningHistoryIfStarted(stayId, organizationId); return }
  const [assignmentRows, ownerRows] = await Promise.all([
    db.select({ userId: cleaningAssignments.cleanerId }).from(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaning.id)),
    db.select({ userId: apartmentManagers.userId }).from(apartmentManagers).where(and(eq(apartmentManagers.organizationId, organizationId), eq(apartmentManagers.apartmentId, cleaning.apartmentId)))
  ])
  await db.transaction(async tx => {
    await tx.update(cleanings).set({ status: 'canceled', updatedAt: new Date() }).where(eq(cleanings.id, cleaning.id))
    await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, cleaning.id))
    await tx.update(tasks).set({ status: 'canceled', updatedAt: new Date() }).where(and(eq(tasks.organizationId, organizationId), eq(tasks.status, 'open'), inArray(tasks.id, db.select({ taskId: cashTaskDetails.taskId }).from(cashTaskDetails).where(eq(cashTaskDetails.cleaningId, cleaning.id)))))
  })
  await notifyUsers({ organizationId, userIds: [...assignmentRows.map(row => row.userId), ...ownerRows.map(row => row.userId), ...await administratorsForOrganization(organizationId)], type: 'stay_conflict', title: 'Уборка отменена', body: 'Бронирование больше не входит в календарь Booking.com', href: '/work' })
}

async function notifyCleaningHistoryIfStarted(stayId: string, organizationId: string) {
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.stayId, stayId), eq(cleanings.organizationId, organizationId), inArray(cleanings.status, ['in_progress', 'completed'])) })
  if (!cleaning) return
  const adminIds = await administratorsForOrganization(organizationId)
  await notifyUsers({ organizationId, userIds: adminIds, type: 'stay_conflict', title: 'Проверьте уборку после отмены бронирования', body: 'Уборка уже начата или завершена; её история сохранена без изменений', href: '/work' })
}

export async function syncAllIcalFeeds() {
  const feeds = await db.select({ id: icalFeeds.id }).from(icalFeeds).where(eq(icalFeeds.enabled, true))
  for (const feed of feeds) await syncIcalFeed(feed.id)
}

export async function syncApartmentIcal(actor: Actor, apartmentId: string) {
  requireRole(actor, 'administrator', 'manager')
  if (!(await canManageApartment(actor, apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  const feed = await db.query.icalFeeds.findFirst({ where: and(eq(icalFeeds.apartmentId, apartmentId), eq(icalFeeds.organizationId, actor.organizationId)) })
  if (!feed) throw createError({ statusCode: 404, statusMessage: 'Календарь не подключён' })
  return syncIcalFeed(feed.id)
}

export async function updateIcalGuestCount(actor: Actor, stayId: string, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  const data = guestCountInput.parse(input)
  const stay = await db.query.stays.findFirst({ where: and(eq(stays.id, stayId), eq(stays.organizationId, actor.organizationId), eq(stays.source, 'ical'), eq(stays.state, 'active')) })
  if (!stay) throw createError({ statusCode: 404, statusMessage: 'Импортированное бронирование не найдено' })
  if (!(await canManageApartment(actor, stay.apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  await db.update(stays).set({ ...data, updatedAt: new Date() }).where(eq(stays.id, stayId))
  await reconcileCleaningGuestPreparation(actor, stay.apartmentId)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'ical_stay.guests_updated', entityType: 'stay', entityId: stayId, payload: data })
  return { ok: true }
}

export async function listIcalConflicts(actor: Actor) {
  requireRole(actor, 'administrator', 'manager')
  const conflicts = await db.query.icalConflicts.findMany({
    where: and(eq(icalConflicts.organizationId, actor.organizationId), inArray(icalConflicts.status, actor.roles.includes('administrator') ? ['open', 'needs_admin'] : ['open'])),
    with: { apartment: { with: { managerAssignments: true } }, importedStay: true, existingStay: true }, orderBy: (table, { desc }) => [desc(table.createdAt)]
  })
  return Promise.all(conflicts.filter(conflict => actor.roles.includes('administrator') || conflict.apartment.managerAssignments.some(item => item.userId === actor.id)).map(async conflict => ({
    id: conflict.id, status: conflict.status, apartmentId: conflict.apartmentId, apartmentName: conflict.apartment.name,
    importedStay: { ...conflict.importedStay, cleaning: await conflictCleaningSummary(conflict.importedStay.id) },
    existingStay: { ...conflict.existingStay, cleaning: await conflictCleaningSummary(conflict.existingStay.id) }
  })))
}

async function conflictCleaningSummary(stayId: string) {
  const cleaning = await db.query.cleanings.findFirst({ where: eq(cleanings.stayId, stayId), with: { assignments: { with: { cleaner: { columns: { id: true, name: true } } } } } })
  if (!cleaning) return null
  const [problems, attachmentRows, inventoryReports, cash, financial, movements] = await Promise.all([
    db.select({ id: cleaningProblems.id, description: cleaningProblems.description, resolvedAt: cleaningProblems.resolvedAt }).from(cleaningProblems).where(eq(cleaningProblems.cleaningId, cleaning.id)),
    db.select({ id: attachments.id, fileName: attachments.fileName }).from(attachments).where(and(eq(attachments.entityType, 'cleaning'), eq(attachments.entityId, cleaning.id))),
    db.select({ name: consumables.name, usedQuantity: cleaningInventoryReports.usedQuantity }).from(cleaningInventoryReports).innerJoin(consumables, eq(cleaningInventoryReports.consumableId, consumables.id)).where(eq(cleaningInventoryReports.cleaningId, cleaning.id)),
    db.query.cashTaskDetails.findFirst({ where: eq(cashTaskDetails.cleaningId, cleaning.id), columns: { expectedAmountEur: true, collectedAmountEur: true, receivedAmountEur: true, receivedAt: true }, with: { task: { columns: { id: true, title: true, status: true } } } }),
    db.select({ type: financialEntries.type, amountEur: financialEntries.amountEur, occurredOn: financialEntries.occurredOn, description: financialEntries.description }).from(financialEntries).where(and(eq(financialEntries.sourceType, 'cleaning'), eq(financialEntries.sourceId, cleaning.id))),
    db.select({ type: inventoryMovements.type, quantity: inventoryMovements.quantity }).from(inventoryMovements).where(and(eq(inventoryMovements.sourceType, 'cleaning'), eq(inventoryMovements.sourceId, cleaning.id)))
  ])
  return { id: cleaning.id, status: cleaning.status, scheduledOn: cleaning.scheduledOn, cleaners: cleaning.assignments.map(assignment => assignment.cleaner.name), problems, attachments: attachmentRows.map(row => row.fileName), inventoryReports, cashTask: cash ? { ...cash.task, expectedAmountEur: cash.expectedAmountEur, collectedAmountEur: cash.collectedAmountEur, receivedAmountEur: cash.receivedAmountEur, receivedAt: cash.receivedAt } : null, financial, inventoryMovements: movements }
}

async function conflictHasSettledMoney(stayId: string) {
  const cleaning = await db.query.cleanings.findFirst({ where: eq(cleanings.stayId, stayId) })
  if (!cleaning) return false
  const [cash, financial] = await Promise.all([
    db.query.cashTaskDetails.findFirst({ where: eq(cashTaskDetails.cleaningId, cleaning.id) }),
    db.query.financialEntries.findFirst({ where: and(eq(financialEntries.sourceType, 'cleaning'), eq(financialEntries.sourceId, cleaning.id)) })
  ])
  return Boolean(cash?.receivedAt || financial)
}

export async function resolveIcalConflict(actor: Actor, conflictId: string, input: unknown) {
  requireRole(actor, 'administrator', 'manager')
  const data = decisionInput.parse(input)
  const conflict = await db.query.icalConflicts.findFirst({ where: and(eq(icalConflicts.id, conflictId), eq(icalConflicts.organizationId, actor.organizationId)), with: { importedStay: true, existingStay: true } })
  if (!conflict || !['open', 'needs_admin'].includes(conflict.status)) throw createError({ statusCode: 404, statusMessage: 'Конфликт не найден' })
  if (!(await canManageApartment(actor, conflict.apartmentId))) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к апартаменту' })
  const imported = conflict.importedStay
  const existing = conflict.existingStay
  if (imported.state !== 'active' || existing.state !== 'active') throw createError({ statusCode: 409, statusMessage: 'Бронирование уже изменилось, обновите календарь' })
  const [claimed] = await db.update(icalConflicts).set({ status: 'resolving', updatedAt: new Date() }).where(and(eq(icalConflicts.id, conflict.id), inArray(icalConflicts.status, ['open', 'needs_admin']))).returning({ id: icalConflicts.id })
  if (!claimed) throw createError({ statusCode: 409, statusMessage: 'Другой владелец уже разрешает этот конфликт' })
  let returnTo: 'open' | 'needs_admin' = 'open'
  try {
  if (data.decision === 'keep_aparts') {
    await db.transaction(async tx => {
      await tx.update(stays).set({ state: 'hidden', updatedAt: new Date() }).where(eq(stays.id, imported.id))
      await tx.update(icalConflicts).set({ status: 'resolved', decision: data.decision, resolvedById: actor.id, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(icalConflicts.id, conflict.id))
    })
    return { ok: true }
  }
  if (data.decision === 'different') {
    await db.transaction(async tx => {
      await tx.update(stays).set({ state: 'superseded', updatedAt: new Date() }).where(eq(stays.id, existing.id))
      await tx.update(icalConflicts).set({ status: 'resolved', decision: data.decision, resolvedById: actor.id, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(icalConflicts.id, conflict.id))
    })
    await cancelUnstartedCleaning(existing.id, actor.organizationId)
    return { ok: true }
  }
  const [importedCleaning, existingCleaning] = await Promise.all([
    db.query.cleanings.findFirst({ where: eq(cleanings.stayId, imported.id) }),
    db.query.cleanings.findFirst({ where: eq(cleanings.stayId, existing.id) })
  ])
  const [existingSettled, importedSettled] = await Promise.all([conflictHasSettledMoney(existing.id), conflictHasSettledMoney(imported.id)])
  const settled = existingSettled || importedSettled
  if ((importedCleaning && existingCleaning || settled) && !actor.roles.includes('administrator')) {
    returnTo = 'needs_admin'
    await notifyUsers({ organizationId: actor.organizationId, userIds: await administratorsForOrganization(actor.organizationId), type: 'stay_conflict', title: 'Нужно разобрать конфликт бронирований', body: 'В конфликте есть связанные уборки или завершённые финансовые операции', href: `/calendar?icalConflict=${conflict.id}` })
    await db.update(icalConflicts).set({ status: 'needs_admin', updatedAt: new Date() }).where(and(eq(icalConflicts.id, conflict.id), eq(icalConflicts.status, 'resolving')))
    return { ok: true, needsAdmin: true }
  }
  if (importedCleaning && existingCleaning && data.targetCleaningId !== importedCleaning.id && data.targetCleaningId !== existingCleaning.id) {
    throw createError({ statusCode: 400, statusMessage: 'Администратору нужно выбрать уборку для привязки' })
  }
  const targetCleaning = data.targetCleaningId ? (data.targetCleaningId === importedCleaning?.id ? importedCleaning : existingCleaning) : importedCleaning ?? existingCleaning
  const oldStayId = targetCleaning?.stayId
  const checkInOn = imported.checkInOn
  const checkOutOn = imported.checkOutOn
  await db.transaction(async tx => {
    await tx.update(stays).set({ state: 'superseded', icalFeedId: null, icalUid: null, updatedAt: new Date() }).where(eq(stays.id, imported.id))
    await tx.update(stays).set({ checkInOn, checkOutOn, source: 'ical', icalFeedId: imported.icalFeedId, icalUid: imported.icalUid, icalSummary: imported.icalSummary, updatedAt: new Date() }).where(eq(stays.id, existing.id))
    await tx.update(icalConflicts).set({ status: 'resolved', decision: data.decision, resolvedById: actor.id, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(icalConflicts.id, conflict.id))
    if (importedCleaning && existingCleaning && targetCleaning) {
      const other = targetCleaning.id === importedCleaning.id ? existingCleaning : importedCleaning
      await tx.update(cleanings).set({ stayId: null, updatedAt: new Date() }).where(eq(cleanings.id, other.id))
    }
    if (targetCleaning) {
      const scheduledOn = ['completed', 'in_progress', 'canceled'].includes(targetCleaning.status) ? targetCleaning.scheduledOn : checkOutOn
      await tx.update(cleanings).set({ ...(oldStayId !== existing.id ? { stayId: existing.id } : {}), scheduledOn, updatedAt: new Date() }).where(eq(cleanings.id, targetCleaning.id))
      if (oldStayId !== existing.id) await tx.update(cashTaskDetails).set({ stayId: existing.id, updatedAt: new Date() }).where(eq(cashTaskDetails.cleaningId, targetCleaning.id))
      if (['open', 'in_progress'].includes(targetCleaning.status)) await tx.update(tasks).set({ dueOn: scheduledOn, updatedAt: new Date() }).where(and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.status, ['open', 'in_progress']), inArray(tasks.id, db.select({ taskId: cashTaskDetails.taskId }).from(cashTaskDetails).where(eq(cashTaskDetails.cleaningId, targetCleaning.id)))))
      if (scheduledOn !== targetCleaning.scheduledOn) {
        const assignments = await tx.select().from(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, targetCleaning.id))
        for (const assignment of assignments) {
          const occupied = await tx.select({ routePosition: cleaningAssignments.routePosition }).from(cleaningAssignments).innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id)).where(and(eq(cleaningAssignments.cleanerId, assignment.cleanerId), eq(cleanings.scheduledOn, scheduledOn), ne(cleaningAssignments.cleaningId, targetCleaning.id)))
          const routePosition = occupied.reduce((max, row) => Math.max(max, row.routePosition), -1) + 1
          await tx.update(cleaningAssignments).set({ routePosition }).where(and(eq(cleaningAssignments.cleaningId, targetCleaning.id), eq(cleaningAssignments.cleanerId, assignment.cleanerId)))
        }
      }
      if (oldStayId) await tx.update(cleanings).set({ stayId: null, updatedAt: new Date() }).where(and(eq(cleanings.stayId, oldStayId), ne(cleanings.id, targetCleaning.id)))
    }
    await tx.update(icalConflicts).set({ importedStayId: existing.id, updatedAt: new Date() }).where(and(eq(icalConflicts.importedStayId, imported.id), eq(icalConflicts.status, 'open'), ne(icalConflicts.id, conflict.id)))
  })
  if (targetCleaning) {
    await publishCleaningChangeForId(actor, targetCleaning.id, 'updated')
    if (oldStayId) await syncCashTasksForStay(actor, oldStayId)
    await syncCashTasksForStay(actor, existing.id)
  }
  await reconcileCleaningGuestPreparation(actor, conflict.apartmentId)
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'ical_conflict.resolved', entityType: 'ical_conflict', entityId: conflict.id, payload: { decision: data.decision, targetCleaningId: targetCleaning?.id ?? null } })
  return { ok: true }
  } catch (error) {
    await db.update(icalConflicts).set({ status: returnTo, updatedAt: new Date() }).where(and(eq(icalConflicts.id, conflict.id), eq(icalConflicts.status, 'resolving')))
    throw error
  }
}
