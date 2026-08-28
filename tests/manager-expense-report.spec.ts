import { describe, expect, it } from 'vitest'
import { categoryVisibilityFromReport, enabledManagerExpenseLines, managerExpenseTotal } from '../server/modules/finance/manager-expense-report'
import { managerExpensePdfDefinition, managerExpensePdfFileName } from '../src/pages/statement/lib/manager-expense-pdf'
import { createManagerExpenseCategoryVisibility, managerExpenseReportLines, managerExpenseReportTotal, updateManagerExpenseCategoryVisibility, visibleManagerExpenseCategories, type ManagerExpenseLine } from '../src/pages/statement/model/manager-expense-report'

const lines: ManagerExpenseLine[] = [
  { id: 'cleaning', category: 'cleaning', description: 'Уборка', occurredOn: '2026-08-10', amountEur: 80, position: 0 },
  { id: 'inventory', category: 'inventory', description: 'Бумага', occurredOn: '2026-08-11', amountEur: 5, position: 1 },
  { id: 'task', category: 'task', description: 'Ремонт', occurredOn: '2026-08-12', amountEur: -10, position: 2 },
  { id: 'other', category: 'other', description: 'Замена лампы', occurredOn: '2026-08-13', amountEur: 12, position: 3 }
]

describe('manager expense report categories', () => {
  it('enables every category for reports created before visibility settings', () => {
    expect(categoryVisibilityFromReport(null)).toEqual({ cleaning: true, inventory: true, task: true, other: true })
    expect(categoryVisibilityFromReport({ cleaningEnabled: false, inventoryEnabled: true, taskEnabled: false, otherEnabled: true })).toEqual({ cleaning: false, inventory: true, task: false, other: true })
  })

  it('excludes disabled categories from manager lines and totals', () => {
    const visibility = { cleaning: true, inventory: false, task: true, other: true }
    expect(enabledManagerExpenseLines(lines, visibility).map(line => line.category)).toEqual(['cleaning', 'task', 'other'])
    expect(managerExpenseTotal(lines, visibility)).toBe(82)
  })

  it('keeps all categories editable for administrators and hides disabled ones from managers', () => {
    const visibility = updateManagerExpenseCategoryVisibility(createManagerExpenseCategoryVisibility(), 'inventory', false)
    expect(visibleManagerExpenseCategories(visibility, true)).toEqual(['cleaning', 'inventory', 'task', 'other'])
    expect(visibleManagerExpenseCategories(visibility, false)).toEqual(['cleaning', 'task', 'other'])
    expect(managerExpenseReportTotal(lines, visibility)).toBe(82)
  })

  it('allows every category to be disabled', () => {
    const visibility = { cleaning: false, inventory: false, task: false, other: false }
    expect(visibleManagerExpenseCategories(visibility, false)).toEqual([])
    expect(managerExpenseReportTotal(lines, visibility)).toBe(0)
  })

  it('condenses visible inventory rows into the manager summary row', () => {
    const reportLines = managerExpenseReportLines([
      ...lines,
      { id: 'inventory-second', category: 'inventory', description: 'Пакеты', occurredOn: '2026-08-15', amountEur: -1.1, position: 3 }
    ], createManagerExpenseCategoryVisibility())

    expect(reportLines.filter(line => line.category === 'inventory')).toEqual([
      expect.objectContaining({ description: 'Расходники', occurredOn: null, amountEur: 3.9 })
    ])
  })

  it('builds the manager PDF without hidden categories and with the matching total', () => {
    const definition = managerExpensePdfDefinition({
      apartmentName: 'L102 · Belvedere',
      month: '2026-08',
      lines,
      categoryVisibility: { cleaning: true, inventory: true, task: false, other: false }
    })
    const serialized = JSON.stringify(definition)

    expect(serialized).toContain('Отчёт по расходам')
    expect(serialized).toContain('L102 · Belvedere')
    expect(serialized).toContain('Уборки')
    expect(serialized).toContain('Расходники')
    expect(serialized).not.toContain('Дополнительные работы')
    expect(serialized).not.toContain('Ремонт')
    expect(serialized).toContain('85,00')
    expect(managerExpensePdfFileName({ apartmentName: 'L102 / Belvedere', month: '2026-08', lines, categoryVisibility: createManagerExpenseCategoryVisibility() })).toBe('rashody-L102-Belvedere-2026-08.pdf')
  })
})
