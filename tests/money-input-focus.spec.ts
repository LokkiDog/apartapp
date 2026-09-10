import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('zero-valued money fields', () => {
  it('clears the displayed zero when the shared money input receives focus', () => {
    const component = readFileSync('src/shared/ui/MoneyInput.vue', 'utf8')

    expect(component).toContain("if (parseEuroInput(raw.value) !== 0) return")
    expect(component).toContain("raw.value = ''")
    expect(component).toContain('@focus="focus"')
  })

  it('uses the same focus behavior for the signed report amount field', () => {
    const preview = readFileSync('src/pages/statement/ui/ManagerExpenseReportPreview.vue', 'utf8')

    expect(preview).toContain("if (input instanceof HTMLInputElement && Number(input.value) === 0) input.value = ''")
    expect(preview).toContain('@focus="clearZeroAmount"')
  })

  it('routes every other EUR entry through the shared money input', () => {
    const files = [
      'src/pages/calendar/CalendarPage.vue',
      'src/pages/expenses/ExpensesPage.vue',
      'src/pages/inventory/InventoryPage.vue',
      'src/pages/problems/ProblemsPage.vue',
      'src/pages/settings/ApartmentTypesSettingsPage.vue',
      'src/pages/settings/ServicesSettingsPage.vue',
      'src/pages/work/WorkPage.vue',
      'src/features/manage-cleaning/ui/CleaningFormSlideover.vue',
    ]

    for (const file of files) expect(readFileSync(file, 'utf8')).toContain('<MoneyInput')
  })
})
