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

export type BookingLayout = 'list' | 'calendar'
export type ListGrouping = 'dates' | 'apartments'
export type CalendarLayout = 'timeline' | 'grid'
export type BookingPreferences = { layout: BookingLayout; grouping: ListGrouping; calendarLayout: CalendarLayout; period: CalendarPeriod }
export function restoreBookingPreferences(saved: unknown, oldView: string | null, oldPeriod: string | null, legacyView: string | null): BookingPreferences {
  const defaults: BookingPreferences = { layout: 'calendar', grouping: 'dates', calendarLayout: 'timeline', period: 'month' }
  if (saved && typeof saved === 'object') {
    const value = saved as Partial<BookingPreferences>
    return {
      layout: value.layout === 'list' ? 'list' : 'calendar',
      grouping: value.grouping === 'apartments' ? 'apartments' : 'dates',
      calendarLayout: value.calendarLayout === 'grid' ? 'grid' : 'timeline',
      period: value.period === 'week' || value.period === 'day' ? value.period : 'month'
    }
  }
  if (!oldView && !legacyView) return defaults
  const migrated = migrateCalendarView(legacyView)
  const view = oldView === 'dates' || oldView === 'apartments' || oldView === 'calendar' ? oldView : migrated.bookingView
  const period = oldPeriod === 'month' || oldPeriod === 'week' || oldPeriod === 'day' ? oldPeriod : migrated.calendarPeriod
  return { layout: view === 'calendar' ? 'calendar' : 'list', grouping: view === 'apartments' ? 'apartments' : 'dates', calendarLayout: view === 'calendar' && period === 'month' ? 'grid' : 'timeline', period }
}
export function bookingCalendarRange(layout: CalendarLayout, period: CalendarPeriod, value: string) {
  if (layout === 'grid') return calendarRange('month', value)
  if (period !== 'month') return calendarRange(period, value)
  const date = new Date(`${value}T12:00:00Z`)
  return { from: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10) }
}
export function shiftCalendarCursor(period: CalendarPeriod, value: string, direction: number) {
  if (period !== 'month') return addDays(value, direction * (period === 'week' ? 7 : 1))
  const date = new Date(`${value}T12:00:00Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)).toISOString().slice(0, 10)
}
