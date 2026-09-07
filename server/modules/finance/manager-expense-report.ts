import Decimal from 'decimal.js'

export const managerExpenseCategories = ['cleaning', 'inventory', 'task', 'other'] as const
export type ManagerExpenseCategory = typeof managerExpenseCategories[number]
export type ManagerExpenseCategoryVisibility = Record<ManagerExpenseCategory, boolean>

export const defaultManagerExpenseCategoryVisibility: ManagerExpenseCategoryVisibility = {
  cleaning: true,
  inventory: true,
  task: true,
  other: true
}

export function categoryVisibilityFromReport(report?: {
  cleaningEnabled: boolean
  inventoryEnabled: boolean
  taskEnabled: boolean
  otherEnabled: boolean
} | null): ManagerExpenseCategoryVisibility {
  if (!report) return { ...defaultManagerExpenseCategoryVisibility }
  return {
    cleaning: report.cleaningEnabled,
    inventory: report.inventoryEnabled,
    task: report.taskEnabled,
    other: report.otherEnabled
  }
}

export function enabledManagerExpenseLines<T extends { category: ManagerExpenseCategory, included?: boolean }>(lines: T[], visibility: ManagerExpenseCategoryVisibility): T[] {
  return lines.filter(line => visibility[line.category] && line.included !== false)
}

export function managerExpenseTotal(lines: Array<{ category: ManagerExpenseCategory, amountEur: number, included?: boolean }>, visibility: ManagerExpenseCategoryVisibility): number {
  return Number(enabledManagerExpenseLines(lines, visibility).reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2))
}
