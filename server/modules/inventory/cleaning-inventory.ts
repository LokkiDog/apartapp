export type CleaningInventoryReport = { consumableId: string; usedQuantity: number; remainingQuantity: number }

type ConfiguredConsumable = {
  consumableId: string
  consumable: { autoWriteOffEnabled: boolean; autoWriteOffQuantity: number }
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
    if (!item.consumable.autoWriteOffEnabled) return []
    const quantity = input.balances.find(balance => balance.consumableId === item.consumableId)?.quantity ?? 0
    const usedQuantity = Number(item.consumable.autoWriteOffQuantity)
    return [{ consumableId: item.consumableId, usedQuantity, remainingQuantity: Math.max(0, quantity - usedQuantity) }]
  })
}
