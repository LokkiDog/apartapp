import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import Decimal from 'decimal.js'
import { consumableInputSchema, inventoryReplenishmentInputSchema, inventoryUsageInputSchema } from '@contracts/crm'
import { canManageApartment, requireRole, type Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { apartmentConsumables, apartments, cleaningAssignments, cleanings, consumables, financialEntries, inventoryLots, inventoryMovements, tasks } from '../../infrastructure/database/schema'
import { createFinancialEntry } from '../finance/finance.service'
import { calculateFifoUsage } from './fifo'

export async function inventoryForApartment(actor: Actor, apartmentId: string) {
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
    await createFinancialEntry({ organizationId: actor.organizationId, apartmentId, type: 'inventory_charge', visibility: 'manager', amountEur: total, occurredOn: new Date().toISOString().slice(0, 10), description: 'Расходники', sourceType: 'inventory_movement', sourceId: movement.id, createdById: actor.id }, tx as unknown as typeof db)
    return { movement, totalCostEur: total }
  })
  return result.movement
}
