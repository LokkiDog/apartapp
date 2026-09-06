import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createCalendarEventMarkers, type CalendarEventMarkerSource } from '../src/pages/calendar/model/calendar-event-markers'

function stay(id: string, apartmentId: string, checkInOn: string, checkOutOn: string): CalendarEventMarkerSource {
  return { id, apartmentId, checkInOn, checkOutOn }
}

describe('calendar arrival and departure markers', () => {
  it('groups a same-day departure and arrival for one apartment', () => {
    const departure = stay('departure', 'apartment-a', '2026-09-01', '2026-09-05')
    const arrival = stay('arrival', 'apartment-a', '2026-09-05', '2026-09-10')

    expect(createCalendarEventMarkers([departure, arrival], ['2026-09-05'])).toEqual([{
      date: '2026-09-05',
      apartmentId: 'apartment-a',
      departureStay: departure,
      arrivalStay: arrival
    }])
  })

  it('keeps different apartments and single event types in separate markers', () => {
    const departure = stay('departure', 'apartment-a', '2026-09-01', '2026-09-05')
    const arrival = stay('arrival', 'apartment-b', '2026-09-05', '2026-09-10')

    expect(createCalendarEventMarkers([arrival, departure], ['2026-09-05'])).toEqual([
      { date: '2026-09-05', apartmentId: 'apartment-a', departureStay: departure },
      { date: '2026-09-05', apartmentId: 'apartment-b', arrivalStay: arrival }
    ])
  })

  it('orders markers by date and apartment and excludes dates outside the visible period', () => {
    const later = stay('later', 'apartment-b', '2026-09-06', '2026-09-08')
    const earlier = stay('earlier', 'apartment-a', '2026-09-05', '2026-09-07')

    expect(createCalendarEventMarkers([later, earlier], ['2026-09-06', '2026-09-07']).map(marker => `${marker.date}:${marker.apartmentId}`)).toEqual([
      '2026-09-06:apartment-b',
      '2026-09-07:apartment-a'
    ])
  })

  it('uses one composite component in all calendar periods and fixed event colors', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const marker = readFileSync('src/pages/calendar/CalendarEventMarker.vue', 'utf8')
    const popover = readFileSync('src/pages/calendar/StayCalendarPopover.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    const locale = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8'))

    expect(locale.calendar.bookingsAndDepartures).toBe('Заезды \\ Выезды')
    expect(page.match(/<CalendarEventMarker/g)).toHaveLength(2)
    expect(marker.match(/<StayCalendarPopover/g)).toHaveLength(2)
    expect(marker).toContain("context=\"departure\"")
    expect(marker).toContain("context=\"arrival\"")
    expect(marker).toContain(':left-label="marker.departureStay.apartment.name"')
    expect(marker).toContain(':left-label="marker.arrivalStay.apartment.name"')
    expect(marker).toMatch(/context="departure"[\s\S]*?:show-cleaning-marker="true"[\s\S]*?:show-service-icons="false"/)
    expect(marker).toMatch(/context="arrival"[\s\S]*?:show-cleaning-marker="false"[\s\S]*?:show-service-icons="true"/)
    expect(marker).not.toContain('calendar.${kind}')
    expect(marker).not.toContain('showApartmentName')
    expect(marker).toContain("backgroundColor: 'var(--calendar-arrival-bg)'")
    expect(marker).toContain("backgroundColor: 'var(--calendar-departure-bg)'")
    expect(styles).toContain('.calendar-event-marker--combined')
    expect(styles).toContain('--calendar-departure-bg: #e8f1f7')
    expect(styles).toContain('--calendar-arrival-bg: #ffebec')
    expect(styles).toContain('white-space: nowrap')
    expect(styles).toContain('.calendar-event-marker__segment .stay-service-icons')
    expect(styles).toContain('flex-shrink: 0')
    expect(styles).toMatch(/\.calendar-event-marker--combined \.calendar-event-marker__segment--departure \.stay-cleaning-marker\s*\{[^}]*top: 50%;[^}]*left: 50%;[^}]*pointer-events: none;[^}]*transform: translate\(-50%, -50%\);/s)
    expect(styles).toMatch(/\.stay-cleaning-marker\.stay-cleaning-indicator--missing\s*\{[^}]*background: #fff7e8;[^}]*opacity: 1;/s)
    expect(popover).toContain('showCleaningMarker?: boolean')
    expect(popover).toContain('showServiceIcons?: boolean')
    expect(popover).toContain('showCleaningMarker: true')
    expect(popover).toContain('showServiceIcons: true')
    expect(popover).toContain('v-if="canManageCleaning && showCleaningMarker"')
    expect(popover).toContain('<StayServiceIcons v-if="showServiceIcons" :services="stay.services" />')
  })

  it('restores and persists the selected calendar event mode', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')

    expect(page).toContain("const eventsOnlyStorageKey = 'aparts.calendar.events-only'")
    expect(page).toContain('const storedEventsOnly = localStorage.getItem(eventsOnlyStorageKey)')
    expect(page).toContain("eventsOnly.value = storedEventsOnly === 'true'")
    expect(page).toContain('localStorage.setItem(eventsOnlyStorageKey, String(value))')
  })

  it('expands month event markers by default and lets each day collapse or expand', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')

    expect(page).toContain('const collapsedMonthMarkerDays = ref(new Set<string>())')
    expect(page).toContain('function isMonthMarkerDayExpanded(day: string) { return !collapsedMonthMarkerDays.value.has(day) }')
    expect(page).toContain('v-show="isMonthMarkerDayExpanded(day) || markerIndex < 3"')
    expect(page).toContain(':aria-expanded="isMonthMarkerDayExpanded(day)"')
    expect(page).toContain('@click="toggleMonthMarkerDay(day)"')
    expect(page).toContain("isMonthMarkerDayExpanded(day) ? t('common.hide')")
    expect(styles).toMatch(/\.calendar-marker-more\s*\{[^}]*min-height: 44px;[^}]*cursor: pointer;/s)
  })
})
