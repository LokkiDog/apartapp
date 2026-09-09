import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { problemExpenseSchema, problemInputSchema, problemListQuerySchema, problemResolveSchema, problemTaskInputSchema, problemUpdateSchema } from '../shared/contracts/problem'
import { createManagerExpenseCategoryVisibility, managerExpenseReportLines, managerExpenseReportTotal } from '../src/pages/statement/model/manager-expense-report'

const apartmentId = '00000000-0000-4000-8000-000000000001'

describe('problem registry contracts', () => {
  it('validates manual problems, resolution comments and individual EUR expenses', () => {
    expect(problemInputSchema.safeParse({ apartmentId, description: '  Broken shower holder  ' }).data).toMatchObject({ description: 'Broken shower holder', details: '' })
    expect(problemInputSchema.parse({ apartmentId, description: 'Broken shower holder', details: '  Loose screw  ' }).details).toBe('Loose screw')
    expect(problemInputSchema.safeParse({ apartmentId, description: '' }).success).toBe(false)
    expect(problemUpdateSchema.parse({ description: 'Broken shower holder' }).details).toBeUndefined()
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

  it('adds an empty details field without rewriting existing problem titles', () => {
    const migration = readFileSync('server/infrastructure/database/migrations/0035_problem_details.sql', 'utf8')
    expect(migration).toContain('ADD COLUMN "details" text DEFAULT \'\' NOT NULL')
    expect(migration).toContain('ADD COLUMN "problem_details" text DEFAULT \'\' NOT NULL')
    expect(migration).not.toContain('RENAME COLUMN')
  })

  it('uses the cleaning-card action layout for problem cards', () => {
    const page = readFileSync('src/pages/problems/ProblemsPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    expect(page).toContain(':modal="false" :portal="false" class="problem-detail-slideover"')
    expect(page).toContain(":ui=\"{ overlay: 'problem-detail-overlay' }\"")
    expect(page).toContain('class="problem-detail-actions work-progress-actions work-progress-actions--in-cleaning"')
    expect(page).toContain('class="work-progress-actions__secondary"')
    expect(page).toContain('class="work-progress-actions__primary"')
    expect(page).toContain('variant="soft" icon="i-lucide-save"')
    expect(page).toContain('icon="i-lucide-circle-check"')
    expect(styles).toContain('.problem-detail-actions.work-progress-actions--in-cleaning {\n  width: 100%;\n}')
    expect(styles).toContain('.work-progress-actions--in-cleaning .work-progress-actions__primary {\n    position: fixed;')
    expect(styles).toContain('bottom: calc(3.9rem + env(safe-area-inset-bottom));')
    expect(styles).toContain('.problem-detail-actions.work-progress-actions--in-cleaning {\n    position: fixed;')
    expect(styles).toContain('.problem-detail-actions.work-progress-actions--in-cleaning .work-progress-actions__primary {\n    position: static;\n    width: auto;\n    justify-content: flex-end;')
    expect(styles).toContain('.problem-detail-overlay[data-slot="overlay"],\n  .problem-detail-slideover[data-slot="content"] {\n    z-index: 24;\n  }')
  })

  it('groups problem details, solution task and expenses into separated sections', () => {
    const page = readFileSync('src/pages/problems/ProblemsPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    expect(page.match(/<section class="problem-detail-section/g)).toHaveLength(3)
    expect(page.indexOf(':label="t(\'problems.photos\')"')).toBeLessThan(page.indexOf('Задача по проблеме'))
    expect(page.indexOf('Задача по проблеме')).toBeLessThan(page.lastIndexOf("t('problems.expenses')"))
    expect(styles).toContain('.problem-detail-section + .problem-detail-section {\n  border-top: 1px solid')
    expect(page).toContain('<section class="problem-detail-section space-y-2">')
    expect(page).toContain(':label="taskStatusLabels[selected.activeSolutionTask.status] ?? selected.activeSolutionTask.status"')
    expect(page).not.toContain(':label="selected.activeSolutionTask.status"')
  })

  it('previews and accumulates multiple problem photos before saving', () => {
    const page = readFileSync('src/pages/problems/ProblemsPage.vue', 'utf8')
    expect(page.match(/<PhotoFileInput :files="photos" @select="choosePhotos"/g)).toHaveLength(2)
    expect(page).toContain('photos.value.push(...selectedPhotos)')
    expect(page).toContain('URL.createObjectURL(file)')
    expect(page).toContain('URL.revokeObjectURL(preview.url)')
    expect(page.match(/v-for="preview in photoPreviews"/g)).toHaveLength(2)
    expect(page).toContain("selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}`); resetPhotos(); await refresh()")
  })
})
