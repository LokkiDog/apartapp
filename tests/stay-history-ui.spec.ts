import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('stay history UI', () => {
  it('renders history and uncleaned panels in both list modes', () => {
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const panel = readFileSync('src/pages/calendar/StayBookingsPanel.vue', 'utf8')
    const row = readFileSync('src/pages/calendar/StayBookingRow.vue', 'utf8')

    expect(page).toContain("bookingView === 'dates' && historyDays")
    expect(page).toContain("bookingView === 'apartments' && historyDays")
    expect(page).toContain("t('calendarHistoryExtra.uncleanedTitle')")
    expect(page).toContain('collapsible')
    expect(page).toContain('warning')
    expect(page).toContain('historyLoading')
    expect(panel).toContain("groupBy: 'date' | 'apartment'")
    expect(panel).toContain('rowVariant')
    expect(panel).toContain('StayBookingRow')
    expect(panel).toContain('collapsible?: boolean')
    expect(panel).toContain('warning?: boolean')
    expect(panel).toContain('<UCollapsible v-if="collapsible" :default-open="true">')
    expect(panel).toContain("'stay-bookings-panel--warning': warning")
    expect(panel).toContain('stay-bookings-panel__header--toggle')
    expect(row).toContain("variant: 'agenda' | 'apartment'")
    expect(row).toContain('booking-row-open')
    expect(row).toContain('v-if="canManageCleaning"')
    expect(row).toContain('stayCleaningHref(stay)')
    expect(row).toContain('stay.childCount > 0')
    expect(row).toContain("`${adults} · ${t('calendar.children')}: ${stay.childCount}`")
    expect(row.match(/guestBreakdownLabel\(stay\)/g)).toHaveLength(3)
  })
})
