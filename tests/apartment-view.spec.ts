import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apartmentSortStorageKey, apartmentSorts, apartmentViewStorageKey, apartmentViews, parseApartmentSort, parseApartmentView } from '../src/pages/apartments/model/apartment-view'

describe('apartment catalog view', () => {
  it('accepts only supported persisted modes and defaults to standard cards', () => {
    expect(apartmentViewStorageKey).toBe('aparts.apartments.view')
    expect(apartmentViews).toEqual(['compact', 'dense', 'standard', 'list'])
    expect(parseApartmentView('compact')).toBe('compact')
    expect(parseApartmentView('dense')).toBe('dense')
    expect(parseApartmentView('standard')).toBe('standard')
    expect(parseApartmentView('list')).toBe('list')
    expect(parseApartmentView('table')).toBe('standard')
    expect(parseApartmentView(null)).toBe('standard')
  })

  it('accepts only supported persisted sort options and defaults to name', () => {
    expect(apartmentSortStorageKey).toBe('aparts.apartments.sort')
    expect(apartmentSorts).toEqual(['name', 'createdAt', 'hotel'])
    expect(parseApartmentSort('name')).toBe('name')
    expect(parseApartmentSort('createdAt')).toBe('createdAt')
    expect(parseApartmentSort('hotel')).toBe('hotel')
    expect(parseApartmentSort('amount')).toBe('name')
    expect(parseApartmentSort(null)).toBe('name')
  })

  it('renders each mode accessibly and keeps full photo cards in dense and standard modes', () => {
    const page = readFileSync('src/pages/apartments/ApartmentsPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')

    expect(page).toContain("v-else-if=\"apartments?.length && view === 'compact'\"")
    expect(page).toContain("v-else-if=\"apartments?.length && view === 'list'\"")
    expect(page).toContain("{ value: 'compact', icon: 'i-lucide-layout-grid'")
    expect(page).toContain("{ value: 'dense', icon: 'i-lucide-grid-2x2'")
    expect(page).toContain("{ value: 'standard', icon: 'i-lucide-panels-top-left'")
    expect(page).toContain("{ value: 'list', icon: 'i-lucide-list'")
    expect(page).toContain(':aria-pressed="view === option.value"')
    expect(page.match(/class="apartment-view-switch"/g)).toHaveLength(1)
    expect(page).toContain('apartment.photo.id}/file?variant=card')
    expect(page).toContain('<ApartmentPhotoCarousel v-if="apartment.photos.length"')
    expect(page).toContain("'apartment-card--dense': view === 'dense'")
    expect(page).toContain('<UDropdownMenu :items="sortMenuItems"')
    expect(page).toContain('v-for="apartment in sortedApartments"')
    expect(styles).toContain('.apartments-collection--compact')
    expect(styles).toContain('.apartments-collection--dense')
    expect(styles).toContain('.apartment-card--dense .apartment-card__body')
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(styles).toContain('.apartment-view-switch__button')
    expect(styles).toContain('.apartment-list-item')
  })

  it('supplies every view label in each supported locale', () => {
    for (const locale of ['ru', 'en', 'he']) {
      const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
      expect(messages.apartments).toMatchObject({
        view: expect.any(String),
        compactView: expect.any(String),
        standardView: expect.any(String),
        listView: expect.any(String),
        sort: expect.any(String),
        sortByName: expect.any(String),
        sortByDate: expect.any(String),
        sortByHotel: expect.any(String)
      })
      expect(messages.common.apartmentDenseView).toEqual(expect.any(String))
    }
  })
})
