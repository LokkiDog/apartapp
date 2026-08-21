import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { cleaningInventoryReportInputSchema, consumableInputSchema, inventoryReplenishmentInputSchema, inventoryUsageInputSchema } from '@contracts/crm'
import { canManageApartment, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { writeAuditLog } from '../../infrastructure/audit/log'
import { db } from '../../infrastructure/database/client'
import { apartmentConsumables, apartments, cleaningAssignments, cleaningInventoryReports, cleanings, consumables, financialEntries, inventoryLots, inventoryMovements, tasks } from '../../infrastructure/database/schema'
import { createFinancialEntry } from '../finance/finance.service'
import { calculateFifoUsage } from './fifo'

type InventoryReport = { consumableId: string; usedQuantity: number; remainingQuantity: number }

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

export async function applyCleaningInventoryReports(tx: any, actor: Actor, cleaning: { id: string; organizationId: string; apartmentId: string }, reports: InventoryReport[]) {
  const configured = await tx.query.apartmentConsumables.findMany({ where: and(eq(apartmentConsumables.apartmentId, cleaning.apartmentId), eq(apartmentConsumables.active, true)), with: { consumable: true } })
  const configuredIds = new Set(configured.map((item: any) => item.consumableId))
  if (reports.some(report => !configuredIds.has(report.consumableId))) throw createError({ statusCode: 400, statusMessage: 'Можно указывать только расходники, настроенные для апартамента' })

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
  await tx.delete(cleaningInventoryReports).where(eq(cleaningInventoryReports.cleaningId, cleaning.id))

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
    const [savedReport] = await tx.insert(cleaningInventoryReports).values({ organizationId: actor.organizationId, cleaningId: cleaning.id, consumableId: report.consumableId, usedQuantity: String(report.usedQuantity), remainingQuantity: String(report.remainingQuantity), discrepancyQuantity: delta.toFixed(3), reportedById: actor.id }).returning()
    if (savedReport) saved.push(savedReport)
  }
  return saved
}

export async function inventoryForCleaning(actor: Actor, cleaningId: string) {
  const cleaning = await cleaningAccess(actor, cleaningId)
  const [items, reports, balances] = await Promise.all([
    db.query.apartmentConsumables.findMany({ where: and(eq(apartmentConsumables.apartmentId, cleaning.apartmentId), eq(apartmentConsumables.active, true)), with: { consumable: true } }),
    db.query.cleaningInventoryReports.findMany({ where: eq(cleaningInventoryReports.cleaningId, cleaningId) }),
    db.select({ consumableId: inventoryLots.consumableId, quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)` }).from(inventoryLots).where(eq(inventoryLots.apartmentId, cleaning.apartmentId)).groupBy(inventoryLots.consumableId)
  ])
  return items.map(item => {
    const quantity = Number(balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0)
    const report = reports.find(value => value.consumableId === item.consumableId)
    return { consumable: item.consumable, quantity, usedQuantity: report ? Number(report.usedQuantity) : 0, remainingQuantity: report ? Number(report.remainingQuantity) : quantity, discrepancyQuantity: report ? Number(report.discrepancyQuantity) : 0 }
  })
}

export async function updateCleaningInventory(actor: Actor, cleaningId: string, input: unknown) {
  const cleaning = await cleaningAccess(actor, cleaningId)
  const data = cleaningInventoryReportInputSchema.parse(input)
  const reports = await db.transaction(tx => applyCleaningInventoryReports(tx, actor, cleaning, data.reports))
  await writeAuditLog({ organizationId: actor.organizationId, actorId: actor.id, action: 'cleaning.inventory_updated', entityType: 'cleaning', entityId: cleaningId, payload: { reports: data.reports.length } })
  return reports
}

export async function listCleaningInventoryDiscrepancies(actor: Actor) {
  requireRole(actor, 'administrator')
  const rows = await db.query.cleaningInventoryReports.findMany({
    where: and(eq(cleaningInventoryReports.organizationId, actor.organizationId), sql`${cleaningInventoryReports.discrepancyQuantity} <> 0`),
    with: { cleaning: { with: { apartment: { with: { hotel: true } } } }, consumable: true, reportedBy: true },
    orderBy: (reports, { desc }) => [desc(reports.reportedAt)]
  })
  return rows.map(row => ({ ...row, usedQuantity: Number(row.usedQuantity), remainingQuantity: Number(row.remainingQuantity), discrepancyQuantity: Number(row.discrepancyQuantity) }))
}

export async function inventoryForApartment(actor: Actor, apartmentId: string) {
  if (actor.roles.includes('manager') && !actor.roles.includes('administrator')) throw createError({ statusCode: 403, statusMessage: 'Управляющим недоступны остатки' })
  const canRead = await canManageApartment(actor, apartmentId) || await (async () => {
    if (!actor.roles.includes('cleaner')) return false
    const assignedCleaning = await db.select({ id: cleanings.id }).from(cleaningAssignments)
      .innerJoin(cleanings, eq(cleaningAssignments.cleaningId, cleanings.id))
      .where(and(eq(cleaningAssignments.cleanerId, actor.id), eq(cleanings.apartmentId, apartmentId))).limit(1)
    if (assignedCleaning.length) return true
    const assignedTask = await db.query.tasks.findFirst({ where: and(eq(tasks.apartmentId, apartmentId), eq(tasks.assigneeId, actor.id), eq(tasks.organizationId, actor.organizationId)) })
    return Boolean(assignedTask)
  })()
  if (!canRead) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к остатку' })
  const items = await db.query.apartmentConsumables.findMany({ where: eq(apartmentConsumables.apartmentId, apartmentId), with: { consumable: true } })
  const balances = await db.select({ consumableId: inventoryLots.consumableId, quantity: sql<string>`coalesce(sum(${inventoryLots.remainingQuantity}), 0)` }).from(inventoryLots).where(eq(inventoryLots.apartmentId, apartmentId)).groupBy(inventoryLots.consumableId)
  return items.map(item => ({ ...item, quantity: Number(balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0), isLow: Number(balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0) <= Number(item.minimumQuantity) }))
}

export async function createConsumable(actor: Actor, input: { name: string, category: string, unit: string }) {
  requireRole(actor, 'administrator')
  return (await db.insert(consumables).values({ ...input, organizationId: actor.organizationId }).returning())[0]
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
    await tx.insert(apartmentConsumables).values({ apartmentId, consumableId: data.consumableId, minimumQuantity: 0, targetQuantity: 0 }).onConflictDoNothing()
    const totalCostEur = Number(new Decimal(data.quantity).times(data.unitCostEur).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    await tx.insert(inventoryLots).values({ apartmentId, consumableId: data.consumableId, remainingQuantity: String(data.quantity), unitCostEur: data.unitCostEur })
    await tx.insert(inventoryMovements).values({ apartmentId, consumableId: data.consumableId, type: 'replenishment', quantity: String(data.quantity), totalCostEur, note: data.note, createdById: actor.id })
  })
  return { ok: true }
}

export async function useStock(actor: Actor, apartmentId: string, input: unknown) {
  const data = inventoryUsageInputSchema.parse(input)
  const sourceBelongsToApartment = data.sourceType === 'cleaning'
    ? await db.query.cleanings.findFirst({ where: and(eq(cleanings.id, data.sourceId), eq(cleanings.apartmentId, apartmentId), eq(cleanings.organizationId, actor.organizationId)) }).then(Boolean)
    : await db.query.tasks.findFirst({ where: and(eq(tasks.id, data.sourceId), eq(tasks.apartmentId, apartmentId), eq(tasks.organizationId, actor.organizationId)) }).then(Boolean)
  if (!sourceBelongsToApartment) throw createError({ statusCode: 404, statusMessage: 'Исходная работа не найдена в этом апартаменте' })
  const canUse = await canManageApartment(actor, apartmentId) || await (async () => {
    if (!actor.roles.includes('cleaner')) return false
    if (data.sourceType === 'cleaning') {
      const assignment = await db.query.cleaningAssignments.findFirst({
        where: and(eq(cleaningAssignments.cleaningId, data.sourceId), eq(cleaningAssignments.cleanerId, actor.id)),
        with: { cleaning: true }
      })
      return assignment?.cleaning.apartmentId === apartmentId
    }
    const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, data.sourceId), eq(tasks.assigneeId, actor.id), eq(tasks.organizationId, actor.organizationId)) })
    return task?.apartmentId === apartmentId
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
  return result.movement
}
