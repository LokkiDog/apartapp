export type BookingView = 'dates' | 'apartments' | 'calendar'
export type CalendarPeriod = 'month' | 'week' | 'day'

export function migrateCalendarView(legacyView: string | null): { bookingView: BookingView; calendarPeriod: CalendarPeriod } {
  if (legacyView === 'week') return { bookingView: 'calendar', calendarPeriod: 'week' }
  if (legacyView === 'month') return { bookingView: 'calendar', calendarPeriod: 'month' }
  return { bookingView: 'dates', calendarPeriod: 'month' }
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function calendarRange(period: CalendarPeriod, value: string) {
  if (period === 'day') return { from: value, to: addDays(value, 1) }
  if (period === 'week') {
    const from = weekStart(value)
    return { from, to: addDays(from, 7) }
  }
  const date = new Date(`${value}T12:00:00Z`)
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const from = weekStart(first)
  return { from, to: addDays(from, 42) }
}

export function bookingsForApartment<T extends { apartmentId: string; checkInOn: string; checkOutOn: string }>(stays: readonly T[], apartmentId: string) {
  return stays.filter(stay => stay.apartmentId === apartmentId).sort((left, right) => left.checkInOn.localeCompare(right.checkInOn) || left.checkOutOn.localeCompare(right.checkOutOn))
}
