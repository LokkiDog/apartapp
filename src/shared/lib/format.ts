let activeLocale = 'ru-RU'
export function setFormatLocale(locale: 'ru' | 'en' | 'he') { activeLocale = locale === 'en' ? 'en-US' : locale === 'he' ? 'he-IL' : 'ru-RU' }
export function getFormatLocale() { return activeLocale }
export const formatEuro = (euros: number) => new Intl.NumberFormat(activeLocale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(euros)
export const formatDateTime = (value: string | Date) => new Intl.DateTimeFormat(activeLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Sofia' }).format(new Date(value))
export const formatDate = (value: string) => new Intl.DateTimeFormat(activeLocale, { dateStyle: 'medium', timeZone: 'Europe/Sofia' }).format(new Date(`${value}T12:00:00Z`))
