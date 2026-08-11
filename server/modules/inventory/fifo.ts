import Decimal from 'decimal.js'

export type FifoLot = { id: string; remainingQuantity: string | number; unitCostEur: number }
export type FifoAllocation = { lotId: string; quantity: string; remainingQuantity: string; costEur: number }

export function calculateFifoUsage(lots: FifoLot[], requestedQuantity: string | number) {
  let remaining = new Decimal(requestedQuantity)
  const allocations: FifoAllocation[] = []

  for (const lot of lots) {
    if (remaining.lte(0)) break
    const available = new Decimal(lot.remainingQuantity)
    const taken = Decimal.min(available, remaining)
    if (taken.lte(0)) continue
    remaining = remaining.minus(taken)
    allocations.push({
      lotId: lot.id,
      quantity: taken.toFixed(3),
      remainingQuantity: available.minus(taken).toFixed(3),
      costEur: Number(taken.times(lot.unitCostEur).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    })
  }

  if (remaining.gt(0)) throw new Error('INSUFFICIENT_STOCK')
  const totalCostEur = Number(allocations.reduce((sum, allocation) => sum.plus(allocation.costEur), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
  return { allocations, totalCostEur }
}
