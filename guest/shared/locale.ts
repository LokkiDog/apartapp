export const guestLocales = ['ru', 'en', 'he', 'bg'] as const
export type GuestLocale = typeof guestLocales[number]
export const guestLanguageNames: Record<GuestLocale, string> = { ru: 'Русский', en: 'English', he: 'עברית', bg: 'Български' }
export const guestLocaleCookieOptions = { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const, path: '/' }

export function parseGuestLocale(value: unknown): GuestLocale | undefined {
  return typeof value === 'string' && (guestLocales as readonly string[]).includes(value) ? value as GuestLocale : undefined
}
export function resolveGuestLocale(query: unknown, saved: unknown): GuestLocale {
  return parseGuestLocale(query) ?? parseGuestLocale(saved) ?? 'ru'
}
export function localizedGuestPath(path: string, locale: GuestLocale, explicit = false): string {
  const url = new URL(path, 'https://guest.invalid')
  if (locale === 'ru' && !explicit) url.searchParams.delete('lang')
  else url.searchParams.set('lang', locale)
  return `${url.pathname}${url.search}${url.hash}`
}
export function guestDirection(locale: GuestLocale) { return locale === 'he' ? 'rtl' : 'ltr' }
