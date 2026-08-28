import { describe, expect, it } from 'vitest'
import { appLocaleSchema } from '../shared/contracts/crm'
import { localizedNotificationBody, localizedNotificationTitle } from '../server/infrastructure/notification/localize'
import ru from '../i18n/locales/ru.json'
import en from '../i18n/locales/en.json'
import he from '../i18n/locales/he.json'

function leafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => leafPaths(nested, prefix ? `${prefix}.${key}` : key))
}

describe('localization contracts', () => {
  it('accepts only supported application locales', () => {
    expect(appLocaleSchema.parse('ru')).toBe('ru')
    expect(appLocaleSchema.parse('en')).toBe('en')
    expect(appLocaleSchema.parse('he')).toBe('he')
    expect(appLocaleSchema.safeParse('de').success).toBe(false)
  })

  it('localizes system notification copy while preserving user text', () => {
    expect(localizedNotificationTitle('problem', 'en', 'Проблема в уборке')).toBe('Work problem')
    expect(localizedNotificationBody('problem', 'he', 'Требуется проверить полотенца')).toBe('Требуется проверить полотенца')
  })

  it('keeps all locale catalogs structurally identical', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(ru).sort())
    expect(leafPaths(he).sort()).toEqual(leafPaths(ru).sort())
  })
})
