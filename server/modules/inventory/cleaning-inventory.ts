import Decimal from 'decimal.js'

export type CleaningInventoryReport = { consumableId: string; usedQuantity: number; remainingQuantity: number }

export function cleaningInventoryReportContext(report: { usedQuantity: string | number; remainingQuantity: string | number; discrepancyQuantity: string | number }) {
  const expectedRemainingQuantity = new Decimal(report.remainingQuantity).minus(report.discrepancyQuantity).toDecimalPlaces(3)
  return {
    startingQuantity: Number(expectedRemainingQuantity.plus(report.usedQuantity).toDecimalPlaces(3)),
    expectedRemainingQuantity: Number(expectedRemainingQuantity)
  }
}

export function shouldPreserveInventoryReportApproval(
  saved: { approvedAt: Date | string | null; usedQuantity: string | number; remainingQuantity: string | number; discrepancyQuantity: string | number },
  next: { usedQuantity: string | number; remainingQuantity: string | number; discrepancyQuantity: string | number }
) {
  return Boolean(saved.approvedAt)
    && new Decimal(saved.usedQuantity).eq(next.usedQuantity)
    && new Decimal(saved.remainingQuantity).eq(next.remainingQuantity)
    && new Decimal(saved.discrepancyQuantity).eq(next.discrepancyQuantity)
}

type ConfiguredConsumable = {
  consumableId: string
  autoWriteOffQuantity: number | null
}

export function resolveCompletionInventoryReports(input: {
  configured: ConfiguredConsumable[]
  balances: Array<{ consumableId: string; quantity: number }>
  submittedReports?: CleaningInventoryReport[]
  savedReports: CleaningInventoryReport[]
}) {
  const submittedByConsumable = new Map(input.submittedReports?.map(report => [report.consumableId, report]))
  const savedByConsumable = new Map(input.savedReports.map(report => [report.consumableId, report]))
  return input.configured.flatMap(item => {
    const explicit = submittedByConsumable.get(item.consumableId) ?? savedByConsumable.get(item.consumableId)
    if (explicit) return [explicit]
    if (item.autoWriteOffQuantity === null) return []
    const quantity = input.balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0
    const usedQuantity = Number(item.autoWriteOffQuantity)
    return [{ consumableId: item.consumableId, usedQuantity, remainingQuantity: Math.max(0, quantity - usedQuantity) }]
  })
}
