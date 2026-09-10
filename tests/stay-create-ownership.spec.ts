import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function localeValue(locale: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, locale)
}

describe('stay creation ownership', () => {
  it('requires an apartment-manager assignment even for administrators', () => {
    const actor = readFileSync('server/infrastructure/auth/actor.ts', 'utf8')
    const stays = readFileSync('server/modules/stay/stay.service.ts', 'utf8')

    expect(actor).toContain('export async function isAssignedToApartment')
    expect(actor).toContain('eq(apartmentManagers.organizationId, actor.organizationId)')
    expect(actor).toContain('eq(apartmentManagers.userId, actor.id)')
    expect(stays).toContain("requireRole(actor, 'administrator', 'manager')")
    expect(stays).toContain('await isAssignedToApartment(actor, data.apartmentId)')
    expect(stays).toContain("statusCode: 403, statusMessage: 'Бронирование можно создать только для своего апартамента'")
  })

  it('limits only the creation form to the current user apartments', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')

    expect(page).toContain('const ownApartments = computed')
    expect(page).toContain('apartment.managers.some(manager => manager.id === userId)')
    expect(page).toContain('if (!editingStay.value) return ownApartments.value')
    expect(page).toContain('<ApartmentSelect\n              v-model="form.apartmentId"\n              :apartments="formApartments"')
    expect(page).toContain(':disabled="!canCreateStays"')
    expect(page).toContain("t('calendar.noOwnedApartments')")
  })

  it('localizes the unavailable creation hint in every supported locale', () => {
    for (const locale of ['ru', 'en', 'he']) {
      const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8')) as Record<string, unknown>
      expect(localeValue(messages, 'calendar.noOwnedApartments')).toEqual(expect.any(String))
    }
  })
})
