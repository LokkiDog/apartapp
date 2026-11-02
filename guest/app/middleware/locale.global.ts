import { parseGuestLocale, guestLocaleCookieOptions, type GuestLocale } from '#shared/locale'

export default defineNuxtRouteMiddleware(to => {
  const selected = parseGuestLocale(to.query.lang)
  if (selected) useCookie<GuestLocale>('aparts-guest-locale', guestLocaleCookieOptions).value = selected
})
