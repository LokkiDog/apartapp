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
})
