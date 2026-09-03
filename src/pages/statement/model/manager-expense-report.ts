import Decimal from 'decimal.js'

export const managerExpenseCategories = ['cleaning', 'inventory', 'task', 'other'] as const
export type ManagerExpenseCategory = typeof managerExpenseCategories[number]
export type ManagerExpenseCategoryVisibility = Record<ManagerExpenseCategory, boolean>

export interface ManagerExpenseLine {
  id: string
  category: ManagerExpenseCategory
  description: string
  occurredOn: string | null
  amountEur: number
  position: number
}

export function createManagerExpenseCategoryVisibility(): ManagerExpenseCategoryVisibility {
  return { cleaning: true, inventory: true, task: true, other: true }
}

export function updateManagerExpenseCategoryVisibility(visibility: ManagerExpenseCategoryVisibility, category: ManagerExpenseCategory, enabled: boolean): ManagerExpenseCategoryVisibility {
  return { ...visibility, [category]: enabled }
}

export function visibleManagerExpenseCategories(visibility: ManagerExpenseCategoryVisibility, editable: boolean): ManagerExpenseCategory[] {
  return managerExpenseCategories.filter(category => editable || visibility[category])
}

export function managerExpenseReportTotal(lines: ManagerExpenseLine[], visibility: ManagerExpenseCategoryVisibility): number {
  return Number(lines.reduce((sum, line) => visibility[line.category] ? sum.plus(line.amountEur || 0) : sum, new Decimal(0)).toDecimalPlaces(2))
}

export function managerExpenseCategoryLines(lines: ManagerExpenseLine[], category: ManagerExpenseCategory): ManagerExpenseLine[] {
  const categoryLines = lines.filter(line => line.category === category)
  if (category !== 'cleaning') return categoryLines
  return categoryLines.sort((left, right) => (left.occurredOn ?? '\uffff').localeCompare(right.occurredOn ?? '\uffff') || left.position - right.position)
}

export function managerExpenseReportLines(lines: ManagerExpenseLine[], visibility: ManagerExpenseCategoryVisibility, inventoryLabel = 'Расходники'): ManagerExpenseLine[] {
  const visible = lines.filter(line => visibility[line.category])
  const inventory = visible.filter(line => line.category === 'inventory')
  const otherLines = visible.filter(line => line.category !== 'inventory')
  if (!inventory.length) return otherLines

  return [
    ...otherLines,
    {
      id: 'manager-inventory-total',
      category: 'inventory',
      description: inventoryLabel,
      occurredOn: null,
      amountEur: Number(inventory.reduce((sum, line) => sum.plus(line.amountEur || 0), new Decimal(0)).toDecimalPlaces(2)),
      position: Math.min(...inventory.map(line => line.position))
    }
  ]
}
