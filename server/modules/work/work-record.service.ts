import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { attachments, cleaningAssignments, cleaningInventoryReports, cleanings, financialEntries, inventoryLots, inventoryMovements, tasks } from '../../infrastructure/database/schema'
import { fileStorage } from '../../infrastructure/storage/local'
import { restoredInventoryLot } from './work-policy'
import { calculateFifoUsage } from '../inventory/fifo'

export type WorkKind = 'cleaning' | 'task'

export async function deleteWorkRecord(kind: WorkKind, workId: string) {
  const storageKeys = await db.transaction(async tx => {
    const movements = await tx.select({
      id: inventoryMovements.id,
      apartmentId: inventoryMovements.apartmentId,
      consumableId: inventoryMovements.consumableId,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      totalCostEur: inventoryMovements.totalCostEur,
      createdAt: inventoryMovements.createdAt
    }).from(inventoryMovements).where(and(
      eq(inventoryMovements.sourceType, kind),
      eq(inventoryMovements.sourceId, workId)
    )).orderBy(desc(inventoryMovements.createdAt))

    for (const movement of movements) {
      if (movement.type === 'usage' || movement.type === 'adjustment_out') {
        await tx.insert(inventoryLots).values({ ...restoredInventoryLot(movement), unitCostEur: movement.type === 'adjustment_out' ? 0 : restoredInventoryLot(movement).unitCostEur })
      } else if (movement.type === 'adjustment_in') {
        const lots = await tx.query.inventoryLots.findMany({ where: and(eq(inventoryLots.apartmentId, movement.apartmentId), eq(inventoryLots.consumableId, movement.consumableId)), orderBy: [asc(inventoryLots.receivedAt)] })
        const fifo = calculateFifoUsage(lots, movement.quantity)
        for (const allocation of fifo.allocations) await tx.update(inventoryLots).set({ remainingQuantity: allocation.remainingQuantity }).where(eq(inventoryLots.id, allocation.lotId))
      }
    }

    const financeConditions = [and(eq(financialEntries.sourceType, kind), eq(financialEntries.sourceId, workId))]
    if (movements.length) {
      financeConditions.push(and(
        eq(financialEntries.sourceType, 'inventory_movement'),
        inArray(financialEntries.sourceId, movements.map(movement => movement.id))
      ))
    }
    await tx.delete(financialEntries).where(financeConditions.length === 1 ? financeConditions[0] : or(...financeConditions))

    const linkedAttachments = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(and(
      eq(attachments.entityType, kind),
      eq(attachments.entityId, workId)
    ))
    await tx.delete(attachments).where(and(eq(attachments.entityType, kind), eq(attachments.entityId, workId)))
    if (movements.length) await tx.delete(inventoryMovements).where(inArray(inventoryMovements.id, movements.map(movement => movement.id)))
    if (kind === 'cleaning') {
      await tx.delete(cleaningInventoryReports).where(eq(cleaningInventoryReports.cleaningId, workId))
      await tx.delete(cleaningAssignments).where(eq(cleaningAssignments.cleaningId, workId))
      await tx.delete(cleanings).where(eq(cleanings.id, workId))
    } else {
      await tx.delete(tasks).where(eq(tasks.id, workId))
    }
    return linkedAttachments.map(attachment => attachment.storageKey)
  })

  await Promise.allSettled(storageKeys.map(storageKey => fileStorage.remove(storageKey)))
}
