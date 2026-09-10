import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apartmentSearchText, matchesApartmentSearch } from '../src/features/select-apartment/model/apartment-search'

const apartment = { name: 'Апартамент 12', hotelName: 'Bansko Heights' }

describe('apartment selection', () => {
  it('finds an apartment by apartment name, hotel name, case-insensitively, and keeps all results for an empty query', () => {
    expect(matchesApartmentSearch(apartment, 'апартамент')).toBe(true)
    expect(matchesApartmentSearch(apartment, 'HEIGHTS')).toBe(true)
    expect(matchesApartmentSearch(apartment, '')).toBe(true)
    expect(apartmentSearchText(apartment)).toContain('Bansko Heights')
  })

  it('uses a shared searchable menu for every single-apartment control', () => {
    const component = readFileSync('src/features/select-apartment/ui/ApartmentSelect.vue', 'utf8')
    expect(component).toContain('<USelectMenu')
    expect(component).toContain(':filter-fields="[\'label\', \'search\']"')
    expect(component).toContain("t('common.searchApartment')")
    expect(component).toContain("t('common.noApartmentsFound')")
    expect(component).toContain("type: 'label' as const")
    expect(component).toContain('label: apartment.name')
    expect(component).toContain('return prependGroup.length ? [prependGroup, ...apartmentGroups] : apartmentGroups')
    expect(component).toContain("new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' })")
    expect(component).toContain('selectedLabel(selectedValue)')
    expect(component).toContain('return apartment?.name ?? \'\'')
    expect(component).not.toContain('`${apartment.name} · ${apartment.hotel.name}`')
    expect(component).toContain("label: 'sticky top-0 z-[1] bg-default")
    expect(component).toContain("value: 'w-full min-w-0 text-start'")

    for (const path of [
      'src/features/manage-cleaning/ui/CleaningFormSlideover.vue',
      'src/pages/work/WorkPage.vue',
      'src/pages/calendar/CalendarPage.vue',
      'src/pages/problems/ProblemsPage.vue',
      'src/pages/expenses/ExpensesPage.vue',
      'src/pages/inventory/InventoryPage.vue',
      'src/pages/statement/StatementPage.vue'
    ]) expect(readFileSync(path, 'utf8')).toContain('ApartmentSelect')
  })

  it('keeps special options and filters the administrator report list without resetting the selection', () => {
    const component = readFileSync('src/features/select-apartment/ui/ApartmentSelect.vue', 'utf8')
    const statement = readFileSync('src/pages/statement/StatementPage.vue', 'utf8')
    expect(component).toContain('prependItems?: ExtraItem[]')
    expect(statement).toContain('const filteredReports = computed')
    expect(statement).toContain('matchesApartmentSearch')
    expect(statement).toContain('v-for="item in filteredReports"')
    expect(statement).toContain('selectedApartmentId === item.apartmentId')
  })

  it('keeps the multiple apartment selector searchable and left-aligns its selected value', () => {
    const component = readFileSync('src/features/select-property-scope/ui/PropertyScopeFilter.vue', 'utf8')
    expect(component).toContain('<ApartmentSelect')
    expect(component).toContain('v-model="apartmentIds"')
    expect(component).toContain(':apartments="apartments"')
    expect(component).toContain('multiple')
    expect(component).toContain(':placeholder="t(\'scope.chooseApartments\')"')
    expect(component).not.toContain('<USelectMenu')
    expect(readFileSync('src/app/styles/main.css', 'utf8')).toContain('[data-reka-popper-content-wrapper] {')
  })

  it('defines shared search copy in every supported locale', () => {
    for (const locale of ['ru', 'en', 'he']) {
      const source = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
      expect(source.common.searchApartment).toBeTruthy()
      expect(source.common.noApartmentsFound).toBeTruthy()
    }
  })
})
