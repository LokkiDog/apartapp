import type { Currency } from '@contracts/currency'

let activeLocale = 'ru-RU'
export function toFormatLocale(locale: string) { return locale === 'en' ? 'en-US' : locale === 'he' ? 'he-IL' : 'ru-RU' }
export function setFormatLocale(locale: 'ru' | 'en' | 'he') { activeLocale = toFormatLocale(locale) }
export function getFormatLocale() { return activeLocale }
export function formatCurrency(amount: number, currency: Currency, locale: string, currencyDisplay: 'code' | 'narrowSymbol' = 'narrowSymbol') {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, currencyDisplay, minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount)
}
export const formatDateTime = (value: string | Date) => new Intl.DateTimeFormat(activeLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Sofia' }).format(new Date(value))
export const formatDate = (value: string) => new Intl.DateTimeFormat(activeLocale, { dateStyle: 'medium', timeZone: 'Europe/Sofia' }).format(new Date(`${value}T12:00:00Z`))
