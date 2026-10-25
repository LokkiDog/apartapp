import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('calendar toolbar', () => {
  it('separates layouts, grouping and calendar mode with compact controls', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    expect(page).toContain("preferences.layout = 'list'")
    expect(page).toContain("preferences.grouping = 'apartments'")
    expect(page).toContain("calendarLayout = 'grid'")
    expect(page).toContain('v-model="eventMode"')
    expect(page).toContain('v-model:open="filtersOpen"')
  })

  it('shows a localized arrival and departure legend only in event mode', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    const ru = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8'))
    const en = JSON.parse(readFileSync('i18n/locales/en.json', 'utf8'))
    const he = JSON.parse(readFileSync('i18n/locales/he.json', 'utf8'))

    expect(page).toContain('v-if="bookingView === \'calendar\' && eventsOnly" class="calendar-events-legend"')
    expect(page.indexOf('class="calendar-events-legend"')).toBeGreaterThan(page.indexOf('class="calendar-month surface"'))
    expect(page.indexOf('class="calendar-events-legend"')).toBeLessThan(page.indexOf('<LazyStayDetailsSlideover'))
    expect(page).toContain("t('calendar.arrivals')")
    expect(page).toContain("t('calendar.departures')")
    expect(styles).toContain('background: var(--calendar-arrival-bg)')
    expect(styles).toContain('background: var(--calendar-departure-bg)')
    expect(styles).toMatch(/\.calendar-events-legend\s*\{[^}]*justify-content: flex-start;/s)
    expect(styles).toContain('box-shadow: inset 0 0 0 1px currentColor')
    expect([ru.calendar.arrivals, en.calendar.arrivals, he.calendar.arrivals]).toEqual(['Заезды', 'Arrivals', 'כניסות'])
    expect([ru.calendar.departures, en.calendar.departures, he.calendar.departures]).toEqual(['Выезды', 'Departures', 'יציאות'])
  })

  it('fits seven month columns on desktop and retains readable mobile columns', () => {
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    expect(styles).toContain('.bookings-content--calendar .calendar-month-content { width: 100%; min-width: 700px;')
    expect(styles).toContain('.bookings-content--calendar .calendar-month-content { min-width: 0; }')
    expect(styles).toContain('@container (min-width: 1200px)')
  })
})
