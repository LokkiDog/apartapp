import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('calendar arrival and departure markers', () => {
  it('uses the requested Russian label and fixed event colors', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const locale = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8'))

    expect(locale.calendar.bookingsAndDepartures).toBe('Заезды \\ Выезды')
    expect(page).toContain("markerEventStyle('arrival')")
    expect(page).toContain("markerEventStyle('departure')")
    expect(page).toContain("backgroundColor: '#dc2626'")
    expect(page).toContain("backgroundColor: '#2563eb'")
    expect(page).toContain("markerEventStyle(stayDeparts(stay, day) ? 'departure' : 'arrival')")
  })
})
