import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { problemExpenseSchema, problemInputSchema, problemListQuerySchema, problemResolveSchema, problemTaskInputSchema } from '../shared/contracts/problem'
import { createManagerExpenseCategoryVisibility, managerExpenseReportLines, managerExpenseReportTotal } from '../src/pages/statement/model/manager-expense-report'

const apartmentId = '00000000-0000-4000-8000-000000000001'

describe('problem registry contracts', () => {
  it('validates manual problems, resolution comments and individual EUR expenses', () => {
    expect(problemInputSchema.safeParse({ apartmentId, description: '  Broken shower holder  ' }).data?.description).toBe('Broken shower holder')
    expect(problemInputSchema.safeParse({ apartmentId, description: '' }).success).toBe(false)
    expect(problemResolveSchema.parse({}).resolutionComment).toBe('')
    expect(problemExpenseSchema.parse({ occurredOn: '2026-09-07', amountEur: '12.345', description: 'Part' }).amountEur).toBe(12.35)
    expect(problemExpenseSchema.safeParse({ occurredOn: '2026-09-07', amountEur: 0, description: 'Part' }).success).toBe(false)
    expect(problemTaskInputSchema.parse({ assigneeId: apartmentId, title: 'Repair' }).ownerCostEur).toBe(0)
    expect(problemTaskInputSchema.safeParse({ assigneeId: apartmentId, title: 'Repair', ownerCostEur: -1 }).success).toBe(false)
    expect(problemListQuerySchema.parse({}).status).toBe('open')
  })

  it('keeps unresolved problem report rows out of totals until an administrator includes them', () => {
    const lines = [{ id: 'problem', category: 'task' as const, description: 'Leak', occurredOn: '2026-09-07', amountEur: 19, position: 0, included: false, problemId: apartmentId }]
    const visibility = createManagerExpenseCategoryVisibility()
    expect(managerExpenseReportTotal(lines, visibility)).toBe(0)
    expect(managerExpenseReportLines(lines, visibility)).toEqual([])
    lines[0]!.included = true
    expect(managerExpenseReportTotal(lines, visibility)).toBe(19)
  })

  it('migrates existing cleaning problems into durable apartment records', () => {
    const migration = readFileSync('server/infrastructure/database/migrations/0032_problem_registry.sql', 'utf8')
    expect(migration).toContain('ADD COLUMN "apartment_id" uuid')
    expect(migration).toContain('ON DELETE set null')
    expect(migration).toContain('financial_entries_problem_id_cleaning_problems_id_fk')
    expect(migration).toContain('manager_expense_report_lines" ADD COLUMN "included"')
  })
})
