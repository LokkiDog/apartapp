import { amenityCodes, amenityGroups } from '../shared/contracts/amenities'
import crmRu from '../i18n/locales/ru.json'
import crmEn from '../i18n/locales/en.json'
import crmHe from '../i18n/locales/he.json'
import { describe, expect, it } from 'vitest'
import { guestDirection, localizedGuestPath, parseGuestLocale, resolveGuestLocale } from '../guest/shared/locale'
import { ru, type GuestCopy } from '../guest/app/content/ru'
import { en } from '../guest/app/content/en'
import { he } from '../guest/app/content/he'
import { bg } from '../guest/app/content/bg'

it('prefers a supported shared-link language, then the saved choice, then Russian', () => {
  expect(resolveGuestLocale('he', 'en')).toBe('he')
  expect(resolveGuestLocale(undefined, 'bg')).toBe('bg')
  expect(resolveGuestLocale('fr', 'en')).toBe('en')
  expect(resolveGuestLocale(['he', 'en'], 'bg')).toBe('bg')
  expect(resolveGuestLocale(undefined, 'invalid')).toBe('ru')
  expect(parseGuestLocale('EN')).toBeUndefined()
  expect(guestDirection('he')).toBe('rtl')
  expect(guestDirection('bg')).toBe('ltr')
})

it('keeps the page, other query values and hash when changing or sharing languages', () => {
  expect(localizedGuestPath('/apartments/pirin-studio?offer=summer&lang=ru#photos', 'en', true)).toBe('/apartments/pirin-studio?offer=summer&lang=en#photos')
  expect(localizedGuestPath('/#contacts', 'he', true)).toBe('/?lang=he#contacts')
  expect(localizedGuestPath('/privacy', 'bg', true)).toBe('/privacy?lang=bg')
  expect(localizedGuestPath('/privacy?lang=he', 'ru', true)).toBe('/privacy?lang=ru')
  expect(localizedGuestPath('/privacy?lang=ru', 'ru')).toBe('/privacy')
})

describe('guest interface translations', () => {
  const copies: Record<string, GuestCopy> = { ru, en, he, bg }
  it.each(Object.entries(copies))('has complete interface and amenity copy in %s', (_, copy) => {
    for (const [key, original] of Object.entries(ru)) {
      if (typeof original === 'string') expect((copy as unknown as Record<string, string>)[key]?.trim()).toBeTruthy()
    }
    for (const key of amenityCodes) expect(copy.amenity[key]?.trim()).toBeTruthy()
    for (const group of amenityGroups) expect(copy.amenityGroups[group.key]?.trim()).toBeTruthy()
    expect(copy.privacyPreferences.trim()).toBeTruthy()
    expect(copy.contactApartment.trim()).toBeTruthy()
  })
})

it.each([crmRu, crmEn, crmHe])('has CRM labels for every supported amenity and category', copy => {
  for (const code of amenityCodes) expect(copy.publication.amenity[code]?.trim()).toBeTruthy()
  for (const group of amenityGroups) expect(copy.publication.amenityGroups[group.key]?.trim()).toBeTruthy()
})
