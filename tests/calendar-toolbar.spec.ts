import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('calendar toolbar', () => {
  it('keeps date navigation beside the stay mode and gives both switches equal columns', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    const toolbar = page.slice(page.indexOf('<div class="calendar-controls surface"'), page.indexOf('<UCollapsible class="calendar-settings"'))

    expect(toolbar).toContain('calendar-controls__calendar-options')
    expect(toolbar.indexOf('calendar-date-navigation')).toBeGreaterThan(toolbar.indexOf('calendar-controls__calendar-options'))
    expect(toolbar.indexOf('calendar-date-navigation')).toBeLessThan(toolbar.indexOf('calendar-events-toggle'))
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 30rem);')
    expect(styles).toContain('.calendar-controls__top--agenda .calendar-view-switch')
    expect(styles).toContain('.calendar-period-switch {\n    grid-column: 2;')
  })

  it('centers the current day when a calendar renders on a phone', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')

    expect(page).toContain("window.matchMedia('(max-width: 639px)').matches")
    expect(page).toContain('ref="calendarBoardRef"')
    expect(page).toContain('ref="calendarMonthRef"')
    expect(page).toContain("querySelector<HTMLElement>('.calendar-day-heading--today, .calendar-month-day--today, .calendar-month-date-cell--today')")
    expect(page).toContain("const stickyApartmentWidth = calendarPeriod.value === 'week' ? Math.min(164, container.clientWidth) : 0")
    expect(page).toContain("container.scrollTo({ left: Math.max(0, targetCenter - visibleCenter), behavior: 'auto' })")
    expect(page).toContain('lastTodayScrollContainer === container && lastTodayScrollKey === scrollKey')
  })

  it('shows a localized arrival and departure legend only in event mode', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    const ru = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8'))
    const en = JSON.parse(readFileSync('i18n/locales/en.json', 'utf8'))
    const he = JSON.parse(readFileSync('i18n/locales/he.json', 'utf8'))

    expect(page).toContain('v-if="bookingView === \'calendar\' && eventsOnly" class="calendar-events-legend"')
    expect(page.indexOf('class="calendar-events-legend"')).toBeGreaterThan(page.indexOf('class="calendar-month surface"'))
    expect(page.indexOf('class="calendar-events-legend"')).toBeLessThan(page.indexOf('<StayDetailsSlideover'))
    expect(page).toContain("t('calendar.arrivals')")
    expect(page).toContain("t('calendar.departures')")
    expect(styles).toContain('background: var(--calendar-arrival-bg)')
    expect(styles).toContain('background: var(--calendar-departure-bg)')
    expect(styles).toMatch(/\.calendar-events-legend\s*\{[^}]*justify-content: flex-start;/s)
    expect(styles).toContain('box-shadow: inset 0 0 0 1px currentColor')
    expect([ru.calendar.arrivals, en.calendar.arrivals, he.calendar.arrivals]).toEqual(['Заезды', 'Arrivals', 'כניסות'])
    expect([ru.calendar.departures, en.calendar.departures, he.calendar.departures]).toEqual(['Выезды', 'Departures', 'יציאות'])
  })

  it('makes every month day column fifty percent wider', () => {
    const styles = readFileSync('src/app/styles/main.css', 'utf8')

    expect(styles).toMatch(/\.calendar-month-content\s*\{[^}]*width: 150%;[^}]*min-width: 1050px;/s)
  })
})
