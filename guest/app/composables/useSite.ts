import { ru, type GuestCopy } from '../content/ru'
import { en } from '../content/en'
import { he } from '../content/he'
import { bg } from '../content/bg'
import { appendStayDates, siteUrl, whatsappUrl, type StayDateRange } from '#shared/site'
import { guestDirection, guestLocaleCookieOptions, localizedGuestPath, parseGuestLocale, resolveGuestLocale, type GuestLocale } from '#shared/locale'

const dateEnquiry = {
  ru: 'Здравствуйте! Хочу уточнить свободные даты.',
  en: 'Hello! I would like to check available dates.',
  he: 'שלום! אשמח לבדוק תאריכים פנויים.',
  bg: 'Здравейте! Бих искал/а да проверя свободните дати.',
}

const translations: Record<GuestLocale, GuestCopy> = { ru, en, he, bg }
export function useSite() {
  const { data: settings } = useNuxtData<import('../../shared/public-site').PublicSite>('public-site')
  const requestOrigin = useRequestURL({ xForwardedHost: true, xForwardedProto: true }).origin
  const route = useRoute()
  const preference = useCookie<GuestLocale | undefined>('aparts-guest-locale', { ...guestLocaleCookieOptions, readonly: true })
  const locale = computed(() => resolveGuestLocale(route.query.lang, preference.value))
  const branding = computed(() => settings.value?.branding)
  const copy = computed(() => {
    const translated = translations[locale.value]
    const site = branding.value
    if (!site) return translated
    return {
      ...translated,
      brand: site.title,
      headline: site.title,
      intro: site.description,
      siteTitle: site.title,
      catalogueTitle: `${translated.apartments} — ${site.title}`,
      catalogueIntro: '',
      hostDescription: '',
      hostWelcome: '',
      contactGeneric: dateEnquiry[locale.value]
    }
  })
  const isRtl = computed(() => guestDirection(locale.value) === 'rtl')
  const url = (path = '/') => siteUrl(settings.value?.websiteUrl || requestOrigin, path)
  const localePath = (path = '/') => localizedGuestPath(path, locale.value, true)
  const pageUrl = (path = '/') => url(localizedGuestPath(path, locale.value))
  const hostDescription = computed(() => settings.value?.hostDescription[locale.value]?.trim() || settings.value?.hostDescription.ru?.trim() || copy.value.hostDescription)
  const contact = (title?: string, slug?: string, dates?: StayDateRange) => {
    const message = title && slug
      ? `${copy.value.contactApartment} ${title}. ${url(localePath(`/apartments/${encodeURIComponent(slug)}`))}`
      : copy.value.contactGeneric
    return whatsappUrl(settings.value?.whatsapp || '', title && slug ? appendStayDates(message, dates, copy.value.contactDates, locale.value) : message)
  }
  function setLocale(value: unknown) {
    const selected = parseGuestLocale(value)
    if (selected) return navigateTo(localizedGuestPath(route.fullPath, selected, true), { replace: true })
  }
  return { copy, settings, branding, contact, url, locale, isRtl, localePath, pageUrl, hostDescription, setLocale }
}
