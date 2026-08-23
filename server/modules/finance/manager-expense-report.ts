import Decimal from 'decimal.js'

export const managerExpenseCategories = ['cleaning', 'inventory', 'task'] as const
export type ManagerExpenseCategory = typeof managerExpenseCategories[number]
export type ManagerExpenseCategoryVisibility = Record<ManagerExpenseCategory, boolean>

export const defaultManagerExpenseCategoryVisibility: ManagerExpenseCategoryVisibility = {
  cleaning: true,
  inventory: true,
  task: true
}

export function categoryVisibilityFromReport(report?: {
  cleaningEnabled: boolean
  inventoryEnabled: boolean
  taskEnabled: boolean
} | null): ManagerExpenseCategoryVisibility {
  if (!report) return { ...defaultManagerExpenseCategoryVisibility }
  return {
    cleaning: report.cleaningEnabled,
    inventory: report.inventoryEnabled,
    task: report.taskEnabled
  }
}

export function enabledManagerExpenseLines<T extends { category: ManagerExpenseCategory }>(lines: T[], visibility: ManagerExpenseCategoryVisibility): T[] {
  return lines.filter(line => visibility[line.category])
}

export function managerExpenseTotal(lines: Array<{ category: ManagerExpenseCategory, amountEur: number }>, visibility: ManagerExpenseCategoryVisibility): number {
  return Number(enabledManagerExpenseLines(lines, visibility).reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2))
}
