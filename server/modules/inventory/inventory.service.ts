import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { cleaningInventoryReportInputSchema, consumableInputSchema, inventoryReplenishmentInputSchema, inventoryStockUpdateInputSchema, inventoryUsageInputSchema } from '@contracts/crm'
import { canAccessAssignedWork, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentConsumables, apartments, cleaningAssignments, cleaningInventoryReports, cleanings, consumables, financialEntries, inventoryLots, inventoryMovements, tasks } from '../../infrastructure/database/schema'
import { createFinancialEntry } from '../finance/finance.service'
import { requireAcceptedCleaningAssignment } from '../cleaning/cleaning-acceptance'
import { publishCleaningChangeForId } from '../cleaning/cleaning-events'
import { cleaningInventoryReportContext, resolveCompletionInventoryReports, shouldPreserveInventoryReportApproval, type CleaningInventoryReport } from './cleaning-inventory'
import { calculateFifoUsage } from './fifo'

type InventoryReport = CleaningInventoryReport

async function cleaningAccess(actor: Actor, cleaningId: string) {
  const cleaning = await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, cleaningId), eq(cleanings.organizationId, actor.organizationId)) })
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  if (actor.roles.includes('administrator')) return cleaning
  if (!actor.roles.includes('cleaner') || ['completed', 'canceled'].includes(cleaning.status)) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к остаткам этой уборки' })
  const assignment = await db.query.cleaningAssignments.findFirst({ where: and(eq(cleaningAssignments.cleaningId, cleaningId), eq(cleaningAssignments.cleanerId, actor.id)) })
  if (!assignment) throw createError({ statusCode: 403, statusMessage: 'Уборка не назначена вам' })
  return cleaning
}

async function removeQuantity(tx: any, apartmentId: string, consumableId: string, quantity: number) {
  if (quantity <= 0) return
  const lots = await tx.query.inventoryLots.findMany({ where: and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, consumableId)), orderBy: [asc(inventoryLots.receivedAt)] })
  let fifo
  try { fifo = calculateFifoUsage(lots, quantity) }
  catch { throw createError({ statusCode: 409, statusMessage: 'Недостаточно остатка для указанного расхода' }) }
  for (const allocation of fifo.allocations) await tx.update(inventoryLots).set({ remainingQuantity: allocation.remainingQuantity }).where(eq(inventoryLots.id, allocation.lotId))
  return fifo
}

function validateInventoryReports(reports: InventoryReport[], configuredIds: Set<string>) {
  if (reports.some(report => !configuredIds.has(report.consumableId))) throw createError({ statusCode: 400, statusMessage: 'Можно указывать только расходники, настроенные для апартамента' })
  if (new Set(reports.map(report => report.consumableId)).size !== reports.length) throw createError({ statusCode: 400, statusMessage: 'Расходники в отчёте не должны повторяться' })
}

async function configuredConsumables(conn: any, cleaning: { organizationId: string; apartmentId: string }) {
  const [items, apartment] = await Promise.all([
    conn.query.apartmentConsumables.findMany({ where: and(eq(apartmentConsumables.apartmentId, cleaning.apartmentId), eq(apartmentConsumables.active, true)), with: { consumable: true } }),
    conn.query.apartments.findFirst({ where: and(eq(apartments.id, cleaning.apartmentId), eq(apartments.organizationId, cleaning.organizationId)), with: { type: { with: { autoWriteOffs: true } } } })
  ])
  const writeOffs = new Map((apartment?.type?.autoWriteOffs ?? []).map((rule: any) => [rule.consumableId, Number(rule.quantity)]))
  return items.map((item: any) => ({ ...item, autoWriteOffQuantity: writeOffs.get(item.consumableId) ?? null }))
}

async function reverseCleaningInventoryEffects(tx: any, cleaning: { id: string }) {
  const previousMovements = await tx.select().from(inventoryMovements).where(and(eq(inventoryMovements.sourceType, 'cleaning'), eq(inventoryMovements.sourceId, cleaning.id), eq(inventoryMovements.origin, 'cleaning_report'))).orderBy(desc(inventoryMovements.createdAt))
  for (const movement of previousMovements) {
    if (movement.type === 'usage') await tx.insert(inventoryLots).values({ apartmentId: movement.apartmentId, consumableId: movement.consumableId, remainingQuantity: movement.quantity, unitCostEur: movement.quantity === '0' ? 0 : Number(new Decimal(movement.totalCostEur).dividedBy(movement.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)) })
    if (movement.type === 'adjustment_out') await tx.insert(inventoryLots).values({ apartmentId: movement.apartmentId, consumableId: movement.consumableId, remainingQuantity: movement.quantity, unitCostEur: 0 })
    if (movement.type === 'adjustment_in') await removeQuantity(tx, movement.apartmentId, movement.consumableId, Number(movement.quantity))
  }
  if (previousMovements.length) {
    await tx.delete(financialEntries).where(inArray(financialEntries.sourceId, previousMovements.map((movement: any) => movement.id)))
    await tx.delete(inventoryMovements).where(inArray(inventoryMovements.id, previousMovements.map((movement: any) => movement.id)))
  }
}

export async function applyCleaningInventoryReports(tx: any, actor: Actor, cleaning: { id: string; organizationId: string; apartmentId: string }, submittedReports?: InventoryReport[]) {
  const configured = await configuredConsumables(tx, cleaning)
  const configuredIds = new Set<string>(configured.map((item: any) => item.consumableId))
  validateInventoryReports(submittedReports ?? [], configuredIds)
  const savedReports = await tx.query.cleaningInventoryReports.findMany({ where: eq(cleaningInventoryReports.cleaningId, cleaning.id) })
  await reverseCleaningInventoryEffects(tx, cleaning)
  await tx.delete(cleaningInventoryReports).where(eq(cleaningInventoryReports.cleaningId, cleaning.id))

  const balances = (await tx.select({ consumableId: inventoryLots.consumableId, quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)` }).from(inventoryLots).where(eq(inventoryLots.apartmentId, cleaning.apartmentId)).groupBy(inventoryLots.consumableId)).map((balance: any) => ({ consumableId: balance.consumableId, quantity: Number(balance.quantity) }))
  const reports = resolveCompletionInventoryReports({ configured, balances, submittedReports, savedReports: savedReports.map((report: any) => ({ consumableId: report.consumableId, usedQuantity: Number(report.usedQuantity), remainingQuantity: Number(report.remainingQuantity) })) })

  const saved = []
  for (const report of reports) {
    const currentLots = await tx.query.inventoryLots.findMany({ where: and(eq(inventoryLots.apartmentId, cleaning.apartmentId), eq(inventoryLots.consumableId, report.consumableId)), orderBy: [asc(inventoryLots.receivedAt)] })
    const currentQuantity = currentLots.reduce((sum: Decimal, lot: any) => sum.plus(lot.remainingQuantity), new Decimal(0))
    if (new Decimal(report.usedQuantity).gt(currentQuantity)) throw createError({ statusCode: 409, statusMessage: `Недостаточно остатка для расходника «${configured.find((item: any) => item.consumableId === report.consumableId)?.consumable.name ?? ''}»` })
    const usage = await removeQuantity(tx, cleaning.apartmentId, report.consumableId, report.usedQuantity)
    const totalCostEur = usage?.totalCostEur ?? 0
    if (report.usedQuantity > 0) {
      const [movement] = await tx.insert(inventoryMovements).values({ apartmentId: cleaning.apartmentId, consumableId: report.consumableId, type: 'usage', quantity: String(report.usedQuantity), totalCostEur, sourceType: 'cleaning', sourceId: cleaning.id, origin: 'cleaning_report', note: 'Расход по показаниям уборки', createdById: actor.id }).returning()
      if (movement) {
        const consumableName = configured.find((item: any) => item.consumableId === report.consumableId)?.consumable.name ?? 'Неизвестный расходник'
        await createFinancialEntry({ organizationId: actor.organizationId, apartmentId: cleaning.apartmentId, type: 'inventory_charge', visibility: 'manager', amountEur: totalCostEur, occurredOn: new Date().toISOString().slice(0, 10), description: `Расход: ${consumableName}`, sourceType: 'inventory_movement', sourceId: movement.id, createdById: actor.id }, tx as unknown as typeof db)
      }
    }
    const expected = currentQuantity.minus(report.usedQuantity)
    const delta = new Decimal(report.remainingQuantity).minus(expected)
    if (delta.gt(0)) {
      await tx.insert(inventoryLots).values({ apartmentId: cleaning.apartmentId, consumableId: report.consumableId, remainingQuantity: delta.toFixed(3), unitCostEur: 0 })
      await tx.insert(inventoryMovements).values({ apartmentId: cleaning.apartmentId, consumableId: report.consumableId, type: 'adjustment_in', quantity: delta.toFixed(3), totalCostEur: 0, sourceType: 'cleaning', sourceId: cleaning.id, origin: 'cleaning_report', note: 'Корректировка по фактическому остатку', createdById: actor.id })
    } else if (delta.lt(0)) {
      await removeQuantity(tx, cleaning.apartmentId, report.consumableId, Math.abs(delta.toNumber()))
      await tx.insert(inventoryMovements).values({ apartmentId: cleaning.apartmentId, consumableId: report.consumableId, type: 'adjustment_out', quantity: Math.abs(delta.toNumber()).toFixed(3), totalCostEur: 0, sourceType: 'cleaning', sourceId: cleaning.id, origin: 'cleaning_report', note: 'Корректировка по фактическому остатку', createdById: actor.id })
    }
    const previousReport = savedReports.find((savedReport: any) => savedReport.consumableId === report.consumableId)
    const approvalIsCurrent = previousReport && shouldPreserveInventoryReportApproval(previousReport, { usedQuantity: report.usedQuantity, remainingQuantity: report.remainingQuantity, discrepancyQuantity: delta.toFixed(3) })
    const [savedReport] = await tx.insert(cleaningInventoryReports).values({
      organizationId: actor.organizationId,
      cleaningId: cleaning.id,
      consumableId: report.consumableId,
      usedQuantity: String(report.usedQuantity),
      remainingQuantity: String(report.remainingQuantity),
      discrepancyQuantity: delta.toFixed(3),
      reportedById: actor.id,
      appliedAt: new Date(),
      approvedAt: approvalIsCurrent ? previousReport.approvedAt : null,
      approvedById: approvalIsCurrent ? previousReport.approvedById : null
    }).returning()
    if (savedReport) saved.push(savedReport)
  }
  return saved
}

export async function saveCleaningInventoryDrafts(tx: any, actor: Actor, cleaning: { id: string; organizationId: string; apartmentId: string }, reports: InventoryReport[]) {
  const configured = await configuredConsumables(tx, cleaning)
  validateInventoryReports(reports, new Set<string>(configured.map((item: any) => item.consumableId)))
  await reverseCleaningInventoryEffects(tx, cleaning)
  await tx.delete(cleaningInventoryReports).where(eq(cleaningInventoryReports.cleaningId, cleaning.id))
  const balances = await tx.select({ consumableId: inventoryLots.consumableId, quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)` }).from(inventoryLots).where(eq(inventoryLots.apartmentId, cleaning.apartmentId)).groupBy(inventoryLots.consumableId)
  const saved = []
  for (const report of reports) {
    const quantity = new Decimal(balances.find((balance: any) => balance.consumableId === report.consumableId)?.quantity ?? 0)
    const discrepancyQuantity = new Decimal(report.remainingQuantity).minus(quantity.minus(report.usedQuantity)).toFixed(3)
    const [savedReport] = await tx.insert(cleaningInventoryReports).values({ organizationId: actor.organizationId, cleaningId: cleaning.id, consumableId: report.consumableId, usedQuantity: String(report.usedQuantity), remainingQuantity: String(report.remainingQuantity), discrepancyQuantity, reportedById: actor.id }).returning()
    if (savedReport) saved.push(savedReport)
  }
  return saved
}

export async function inventoryForCleaning(actor: Actor, cleaningId: string) {
  const cleaning = await cleaningAccess(actor, cleaningId)
  const [items, reports, balances] = await Promise.all([
    configuredConsumables(db, cleaning),
    db.query.cleaningInventoryReports.findMany({ where: eq(cleaningInventoryReports.cleaningId, cleaningId), with: { reportedBy: { columns: { id: true, name: true } }, approvedBy: { columns: { id: true, name: true } } } }),
    db.select({ consumableId: inventoryLots.consumableId, quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)` }).from(inventoryLots).where(eq(inventoryLots.apartmentId, cleaning.apartmentId)).groupBy(inventoryLots.consumableId)
  ])
  return items.map((item: any) => {
    const quantity = Number(balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0)
    const report = reports.find(value => value.consumableId === item.consumableId)
    const autoWriteOffQuantity = !['completed', 'canceled'].includes(cleaning.status) ? item.autoWriteOffQuantity : null
    const usedQuantity = report ? Number(report.usedQuantity) : autoWriteOffQuantity ?? 0
    const remainingQuantity = report ? Number(report.remainingQuantity) : Math.max(0, quantity - usedQuantity)
    const reportContext = report ? cleaningInventoryReportContext(report) : { startingQuantity: quantity, expectedRemainingQuantity: remainingQuantity }
    return {
      consumable: item.consumable,
      autoWriteOffQuantity,
      quantity,
      usedQuantity,
      remainingQuantity,
      discrepancyQuantity: report ? Number(report.discrepancyQuantity) : 0,
      startingQuantity: reportContext.startingQuantity,
      expectedRemainingQuantity: reportContext.expectedRemainingQuantity,
      report: report ? {
        id: report.id,
        reportedBy: report.reportedBy,
        reportedAt: report.reportedAt,
        appliedAt: report.appliedAt,
        approvedAt: report.approvedAt,
        approvedBy: report.approvedBy,
        usedQuantity: Number(report.usedQuantity),
        remainingQuantity: Number(report.remainingQuantity),
        discrepancyQuantity: Number(report.discrepancyQuantity),
        startingQuantity: reportContext.startingQuantity,
        expectedRemainingQuantity: reportContext.expectedRemainingQuantity
      } : null
    }
  })
}

export async function updateCleaningInventory(actor: Actor, cleaningId: string, input: unknown) {
  const cleaning = await cleaningAccess(actor, cleaningId)
  await requireAcceptedCleaningAssignment(actor, cleaningId)
  const data = cleaningInventoryReportInputSchema.parse(input)
  if (cleaning.status === 'canceled') throw createError({ statusCode: 409, statusMessage: 'Отмененную уборку нельзя изменить' })
  if (cleaning.status !== 'in_progress' && cleaning.status !== 'completed') throw createError({ statusCode: 409, statusMessage: 'Сначала начните уборку' })
  const reports = await db.transaction(tx => ['completed', 'canceled'].includes(cleaning.status)
    ? applyCleaningInventoryReports(tx, actor, cleaning, data.reports)
    : saveCleaningInventoryDrafts(tx, actor, cleaning, data.reports))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.inventory_updated', entityType: 'cleaning', entityId: cleaningId, payload: { reports: data.reports.length } })
  await publishCleaningChangeForId(actor, cleaningId, 'inventory')
  return reports
}

export async function listCleaningInventoryDiscrepancies(actor: Actor) {
  requireRole(actor, 'administrator')
  const rows = await db.query.cleaningInventoryReports.findMany({
    where: and(eq(cleaningInventoryReports.organizationId, actor.organizationId), isNotNull(cleaningInventoryReports.appliedAt), isNull(cleaningInventoryReports.approvedAt), sql`${cleaningInventoryReports.discrepancyQuantity} <> 0`),
    with: { cleaning: { with: { apartment: { with: { hotel: true } } } }, consumable: true, reportedBy: true },
    orderBy: (reports, { desc }) => [desc(reports.reportedAt)]
  })
  return rows.map(row => ({ ...row, usedQuantity: Number(row.usedQuantity), remainingQuantity: Number(row.remainingQuantity), discrepancyQuantity: Number(row.discrepancyQuantity) }))
}

export async function approveCleaningInventoryDiscrepancy(actor: Actor, reportId: string) {
  requireRole(actor, 'administrator')
  const report = await db.query.cleaningInventoryReports.findFirst({ where: and(eq(cleaningInventoryReports.id, reportId), eq(cleaningInventoryReports.organizationId, actor.organizationId)) })
  if (!report) throw createError({ statusCode: 404, statusMessage: 'Расхождение не найдено' })
  if (!report.appliedAt || new Decimal(report.discrepancyQuantity).eq(0)) throw createError({ statusCode: 409, statusMessage: 'Это расхождение нельзя утвердить' })
  if (report.approvedAt) return { ok: true, approvedAt: report.approvedAt, approvedById: report.approvedById }

  const approvedAt = new Date()
  const [approved] = await db.update(cleaningInventoryReports)
    .set({ approvedAt, approvedById: actor.id, updatedAt: approvedAt })
    .where(and(eq(cleaningInventoryReports.id, reportId), eq(cleaningInventoryReports.organizationId, actor.organizationId), isNull(cleaningInventoryReports.approvedAt)))
    .returning()
  if (!approved) {
    const current = await db.query.cleaningInventoryReports.findFirst({ where: and(eq(cleaningInventoryReports.id, reportId), eq(cleaningInventoryReports.organizationId, actor.organizationId)) })
    if (current?.approvedAt) return { ok: true, approvedAt: current.approvedAt, approvedById: current.approvedById }
    throw createError({ statusCode: 409, statusMessage: 'Не удалось утвердить расхождение' })
  }
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'inventory.discrepancy_approved', entityType: 'cleaning_inventory_report', entityId: reportId, payload: { cleaningId: report.cleaningId, consumableId: report.consumableId, discrepancyQuantity: Number(report.discrepancyQuantity), remainingQuantity: Number(report.remainingQuantity) } })
  await publishCleaningChangeForId(actor, report.cleaningId, 'inventory')
  return { ok: true, approvedAt: approved.approvedAt, approvedById: approved.approvedById }
}

export async function inventoryForApartment(actor: Actor, apartmentId: string) {
  const canRead = actor.roles.includes('administrator') || await (async () => {
    if (!actor.roles.includes('cleaner')) return false
    const assignedCleaning = await db.select({ id: cleanings.id }).from(cleaningAssignments)
      .innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id))
      .where(and(eq(cleaningAssignments.cleanerId, actor.id), eq(cleanings.apartmentId, apartmentId))).limit(1)
    if (assignedCleaning.length) return true
    const assignedTask = await db.query.tasks.findFirst({ where: and(eq(tasks.apartmentId, apartmentId), eq(tasks.assigneeId, actor.id), eq(tasks.organizationId, actor.organizationId)) })
    return Boolean(assignedTask)
  })()
  if (!canRead) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к остатку' })
  const [items, apartment] = await Promise.all([
    db.query.apartmentConsumables.findMany({ where: eq(apartmentConsumables.apartmentId, apartmentId), with: { consumable: true } }),
    db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)), with: { type: { with: { autoWriteOffs: true } } } })
  ])
  const writeOffs = new Map((apartment?.type?.autoWriteOffs ?? []).map(rule => [rule.consumableId, Number(rule.quantity)]))
  const balances = await db.select({
    consumableId: inventoryLots.consumableId,
    quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)`,
    unitCostEur: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity} * ${inventoryLots.unitCostEur}) / nullif(sum(${inventoryLots.remainingQuantity}), 0), 0)`
  }).from(inventoryLots).where(eq(inventoryLots.apartmentId, apartmentId)).groupBy(inventoryLots.consumableId)
  return items.map(item => {
    const balance = balances.find(value => value.consumableId === item.consumableId)
    const quantity = Number(balance?.quantity ?? 0)
    return { ...item, autoWriteOffQuantity: writeOffs.get(item.consumableId) ?? null, quantity, unitCostEur: Number(balance?.unitCostEur ?? 0), isLow: quantity <= Number(item.minimumQuantity) }
  })
}

export async function createConsumable(actor: Actor, input: unknown) {
  requireRole(actor, 'administrator')
  return (await db.insert(consumables).values({ ...consumableInputSchema.parse(input), organizationId: actor.organizationId }).returning())[0]
}

export async function listConsumables(actor: Actor) {
  requireRole(actor, 'administrator')
  return db.query.consumables.findMany({ where: eq(consumables.organizationId, actor.organizationId), orderBy: (consumables, { asc }) => [asc(consumables.name)] })
}

export async function updateConsumable(actor: Actor, consumableId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = consumableInputSchema.parse(input)
  const [consumable] = await db.update(consumables).set({ ...data, updatedAt: new Date() })
    .where(and(eq(consumables.id, consumableId), eq(consumables.organizationId, actor.organizationId)))
    .returning()
  if (!consumable) throw createError({ statusCode: 404, statusMessage: 'Расходник не найден' })
  return consumable
}

export async function deleteConsumable(actor: Actor, consumableId: string) {
  requireRole(actor, 'administrator')
  const consumable = await db.query.consumables.findFirst({ where: and(eq(consumables.id, consumableId), eq(consumables.organizationId, actor.organizationId)) })
  if (!consumable) throw createError({ statusCode: 404, statusMessage: 'Расходник не найден' })
  await db.transaction(async tx => {
    const movements = await tx.select({ id: inventoryMovements.id }).from(inventoryMovements).where(eq(inventoryMovements.consumableId, consumableId))
    if (movements.length) await tx.delete(financialEntries).where(inArray(financialEntries.sourceId, movements.map(movement => movement.id)))
    await tx.delete(inventoryMovements).where(eq(inventoryMovements.consumableId, consumableId))
    await tx.delete(inventoryLots).where(eq(inventoryLots.consumableId, consumableId))
    await tx.delete(apartmentConsumables).where(eq(apartmentConsumables.consumableId, consumableId))
    await tx.delete(consumables).where(eq(consumables.id, consumableId))
  })
  return { ok: true, deleted: { consumable: 1 } }
}

export async function enableApartmentConsumable(actor: Actor, apartmentId: string, input: { consumableId: string, minimumQuantity: number, targetQuantity: number }) {
  requireRole(actor, 'administrator')
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  const consumable = await db.query.consumables.findFirst({ where: and(eq(consumables.id, input.consumableId), eq(consumables.organizationId, actor.organizationId)) })
  if (!apartment || !consumable) throw createError({ statusCode: 404, statusMessage: 'Апартамент или расходник не найден' })
  return (await db.insert(apartmentConsumables).values({ apartmentId, consumableId: input.consumableId, minimumQuantity: input.minimumQuantity, targetQuantity: input.targetQuantity }).onConflictDoUpdate({ target: [apartmentConsumables.apartmentId, apartmentConsumables.consumableId], set: { minimumQuantity: input.minimumQuantity, targetQuantity: input.targetQuantity, active: true, updatedAt: new Date() } }).returning())[0]
}

export async function replenishStock(actor: Actor, apartmentId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = inventoryReplenishmentInputSchema.parse(input)
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) })
  if (!apartment) throw createError({ statusCode: 404, statusMessage: 'Апартамент не найден' })
  await db.transaction(async tx => {
    await tx.insert(apartmentConsumables).values({ apartmentId, consumableId: data.consumableId, minimumQuantity: data.minimumQuantity, targetQuantity: data.targetQuantity }).onConflictDoUpdate({ target: [apartmentConsumables.apartmentId, apartmentConsumables.consumableId], set: { minimumQuantity: data.minimumQuantity, targetQuantity: data.targetQuantity, active: true, updatedAt: new Date() } })
    const totalCostEur = Number(new Decimal(data.quantity).times(data.unitCostEur).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    await tx.insert(inventoryLots).values({ apartmentId, consumableId: data.consumableId, remainingQuantity: String(data.quantity), unitCostEur: data.unitCostEur })
    await tx.insert(inventoryMovements).values({ apartmentId, consumableId: data.consumableId, type: 'replenishment', quantity: String(data.quantity), totalCostEur, note: data.note, createdById: actor.id })
  })
  return { ok: true }
}

export async function updateStock(actor: Actor, apartmentId: string, consumableId: string, input: unknown) {
  requireRole(actor, 'administrator')
  const data = inventoryStockUpdateInputSchema.parse(input)
  const [apartment, consumable] = await Promise.all([
    db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) }),
    db.query.consumables.findFirst({ where: and(eq(consumables.id, consumableId), eq(consumables.organizationId, actor.organizationId)) })
  ])
  if (!apartment || !consumable) throw createError({ statusCode: 404, statusMessage: 'Апартамент или расходник не найден' })

  await db.transaction(async tx => {
    const lots = await tx.query.inventoryLots.findMany({
      where: and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, consumableId)),
      orderBy: [asc(inventoryLots.receivedAt)]
    })
    const currentQuantity = lots.reduce((sum: Decimal, lot: any) => sum.plus(lot.remainingQuantity), new Decimal(0))
    const delta = new Decimal(data.quantity).minus(currentQuantity)

    await tx.insert(apartmentConsumables).values({ apartmentId, consumableId, minimumQuantity: data.minimumQuantity, targetQuantity: data.targetQuantity })
      .onConflictDoUpdate({ target: [apartmentConsumables.apartmentId, apartmentConsumables.consumableId], set: { minimumQuantity: data.minimumQuantity, targetQuantity: data.targetQuantity, active: true, updatedAt: new Date() } })

    if (delta.gt(0)) {
      const quantity = delta.toFixed(3)
      const totalCostEur = Number(delta.times(data.unitCostEur).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
      await tx.insert(inventoryLots).values({ apartmentId, consumableId, remainingQuantity: quantity, unitCostEur: data.unitCostEur })
      await tx.insert(inventoryMovements).values({ apartmentId, consumableId, type: 'adjustment_in', quantity, totalCostEur, note: data.note, createdById: actor.id })
    } else if (delta.lt(0)) {
      const quantity = delta.abs().toNumber()
      await removeQuantity(tx, apartmentId, consumableId, quantity)
      await tx.insert(inventoryMovements).values({ apartmentId, consumableId, type: 'adjustment_out', quantity: delta.abs().toFixed(3), totalCostEur: 0, note: data.note, createdById: actor.id })
    }
    if (data.quantity > 0 && lots.length) await tx.update(inventoryLots).set({ unitCostEur: data.unitCostEur }).where(and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, consumableId)))
  })
  return { ok: true }
}

export async function deleteApartmentStock(actor: Actor, apartmentId: string, consumableId: string) {
  requireRole(actor, 'administrator')
  const [apartment, configuredStock] = await Promise.all([
    db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)) }),
    db.query.apartmentConsumables.findFirst({ where: and(eq(apartmentConsumables.apartmentId, apartmentId), eq(apartmentConsumables.consumableId, consumableId)) })
  ])
  if (!apartment || !configuredStock) throw createError({ statusCode: 404, statusMessage: 'Остаток в апартаменте не найден' })

  const deletedQuantity = await db.transaction(async tx => {
    const lots = await tx.query.inventoryLots.findMany({ where: and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, consumableId)) })
    const quantity = lots.reduce((sum: Decimal, lot: any) => sum.plus(lot.remainingQuantity), new Decimal(0))
    if (quantity.gt(0)) {
      await tx.insert(inventoryMovements).values({
        apartmentId,
        consumableId,
        type: 'adjustment_out',
        quantity: quantity.toFixed(3),
        totalCostEur: 0,
        origin: 'manual',
        note: 'Удаление остатка из апартамента',
        createdById: actor.id
      })
    }
    await tx.delete(inventoryLots).where(and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, consumableId)))
    await tx.delete(apartmentConsumables).where(and(eq(apartmentConsumables.apartmentId, apartmentId), eq(apartmentConsumables.consumableId, consumableId)))
    return quantity.toNumber()
  })

  await writeAuditLog({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: 'inventory.apartment_stock_deleted',
    entityType: 'apartment',
    entityId: apartmentId,
    payload: { consumableId, quantity: deletedQuantity }
  })
  return { ok: true }
}

export async function useStock(actor: Actor, apartmentId: string, input: unknown) {
  const data = inventoryUsageInputSchema.parse(input)
  const sourceCleaning = data.sourceType === 'cleaning'
    ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, data.sourceId), eq(cleanings.apartmentId, apartmentId), eq(cleanings.organizationId, actor.organizationId)) })
    : null
  const sourceBelongsToApartment = data.sourceType === 'cleaning'
    ? Boolean(sourceCleaning)
    : await db.query.tasks.findFirst({ where: and(eq(tasks.id, data.sourceId), eq(tasks.apartmentId, apartmentId), eq(tasks.organizationId, actor.organizationId)) }).then(Boolean)
  if (!sourceBelongsToApartment) throw createError({ statusCode: 404, statusMessage: 'Исходная работа не найдена в этом апартаменте' })
  if (data.sourceType === 'cleaning' && sourceCleaning?.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Сначала начните уборку' })
  const canUse = actor.roles.includes('administrator') || await (async () => {
    if (!actor.roles.includes('cleaner')) return false
    if (data.sourceType === 'cleaning') {
      const assignment = await db.query.cleaningAssignments.findFirst({
        where: and(eq(cleaningAssignments.cleaningId, data.sourceId), eq(cleaningAssignments.cleanerId, actor.id)),
        with: { cleaning: true }
      })
      if (!assignment || assignment.cleaning.apartmentId !== apartmentId) return false
      await requireAcceptedCleaningAssignment(actor, data.sourceId)
      return true
    }
    const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, data.sourceId), eq(tasks.organizationId, actor.organizationId)) })
    return task?.apartmentId === apartmentId && canAccessAssignedWork(actor, task.assigneeId)
  })()
  if (!canUse) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к расходникам' })
  const result = await db.transaction(async tx => {
    const lots = await tx.query.inventoryLots.findMany({ where: and(eq(inventoryLots.apartmentId, apartmentId), eq(inventoryLots.consumableId, data.consumableId)), orderBy: [asc(inventoryLots.receivedAt)] })
    let fifo
    try { fifo = calculateFifoUsage(lots, data.quantity) }
    catch { throw createError({ statusCode: 409, statusMessage: 'Недостаточно остатка: зафиксируйте проблему для администратора' }) }
    for (const allocation of fifo.allocations) await tx.update(inventoryLots).set({ remainingQuantity: allocation.remainingQuantity }).where(eq(inventoryLots.id, allocation.lotId))
    const total = fifo.totalCostEur
    const [movement] = await tx.insert(inventoryMovements).values({ apartmentId, consumableId: data.consumableId, type: 'usage', quantity: String(data.quantity), totalCostEur: total, sourceType: data.sourceType, sourceId: data.sourceId, note: data.note, createdById: actor.id }).returning()
    if (!movement) throw createError({ statusCode: 500, statusMessage: 'Не удалось списать расходник' })
    const consumable = await tx.query.consumables.findFirst({ where: and(eq(consumables.id, data.consumableId), eq(consumables.organizationId, actor.organizationId)) })
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId, type: 'inventory_charge', visibility: 'manager', amountEur: total, occurredOn: new Date().toISOString().slice(0, 10), description: `Расход: ${consumable?.name ?? 'Неизвестный расходник'}`, sourceType: 'inventory_movement', sourceId: movement.id, createdById: actor.id }, tx as unknown as typeof db)
    return { movement, totalCostEur: total }
  })
  if (data.sourceType === 'cleaning') await publishCleaningChangeForId(actor, data.sourceId, 'inventory')
  return result.movement
}
