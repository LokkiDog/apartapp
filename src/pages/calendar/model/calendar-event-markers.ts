export type CalendarEventMarkerSource = {
  id: string
  apartmentId: string
  checkInOn: string
  checkOutOn: string
}

export type CalendarEventMarker<TStay extends CalendarEventMarkerSource = CalendarEventMarkerSource> = {
  date: string
  apartmentId: string
  departureStay?: TStay
  arrivalStay?: TStay
}

export function createCalendarEventMarkers<TStay extends CalendarEventMarkerSource>(
  stays: readonly TStay[],
  dates: readonly string[]
): Array<CalendarEventMarker<TStay>> {
  const visibleDates = new Set(dates)
  const markers = new Map<string, CalendarEventMarker<TStay>>()

  function markerFor(stay: TStay, date: string) {
    const key = `${date}:${stay.apartmentId}`
    const existing = markers.get(key)
    if (existing) return existing

    const marker: CalendarEventMarker<TStay> = { date, apartmentId: stay.apartmentId }
    markers.set(key, marker)
    return marker
  }

  for (const stay of stays) {
    if (visibleDates.has(stay.checkOutOn)) markerFor(stay, stay.checkOutOn).departureStay = stay
    if (visibleDates.has(stay.checkInOn)) markerFor(stay, stay.checkInOn).arrivalStay = stay
  }

  return [...markers.values()].sort((left, right) => left.date.localeCompare(right.date)
    || left.apartmentId.localeCompare(right.apartmentId))
}
