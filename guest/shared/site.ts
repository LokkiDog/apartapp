export function siteUrl(base: string, path = '/') {
  return new URL(path, `${base.replace(/\/+$/, '')}/`).href
}

export function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/[\s()+-]/g, '')
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) return undefined
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export type StayDateRange = { start: string, end: string }
export function validStayDates(range: StayDateRange) {
  if (!range.start && !range.end) return true
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  return validDate(range.start) && validDate(range.end) && range.end > range.start
}
export function appendStayDates(message: string, range: StayDateRange | undefined, label: string, locale: string) {
  if (!range?.start || !range.end || !validStayDates(range)) return message
  const formatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${message}\n${label}: ${formatter.format(new Date(`${range.start}T12:00:00Z`))} — ${formatter.format(new Date(`${range.end}T12:00:00Z`))}`
}
