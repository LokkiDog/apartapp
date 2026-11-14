import type { MessagingAutomation } from '../../../shared/contracts/messaging-automation'

export function awayPeriod(date: Date, timezone: string, settings: Pick<MessagingAutomation, 'days' | 'opens' | 'closes'>) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  const day = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`)
  const time = `${part('hour')}:${part('minute')}`
  const isWorkingDay = () => settings.days.includes(day.getUTCDay() || 7)
  if (isWorkingDay() && time >= settings.opens && time < settings.closes) return null
  // The period starts at the last closing, including across weekends and DST.
  if (!isWorkingDay() || time < settings.closes) {
    do {
      day.setUTCDate(day.getUTCDate() - 1)
    } while (!isWorkingDay())
  }
  return day.toISOString().slice(0, 10)
}
