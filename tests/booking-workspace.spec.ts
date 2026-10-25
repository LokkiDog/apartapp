import { describe, expect, it } from 'vitest'
import { bookingCalendarRange, restoreBookingPreferences, shiftCalendarCursor } from '../src/pages/calendar/model/calendar-view'
import { assignMonthWeekLanes } from '../src/pages/calendar/model/calendar-timeline'

describe('booking workspace preferences', () => {
  it('defaults to monthly timeline and preserves legacy choices', () => {
    expect(restoreBookingPreferences(null, null, null, null)).toEqual({ layout: 'calendar', grouping: 'dates', calendarLayout: 'timeline', period: 'month' })
    expect(restoreBookingPreferences(null, 'apartments', 'week', null)).toMatchObject({ layout: 'list', grouping: 'apartments', period: 'week' })
    expect(restoreBookingPreferences(null, 'calendar', 'month', null).calendarLayout).toBe('grid')
    expect(restoreBookingPreferences(null, 'calendar', 'day', null).calendarLayout).toBe('timeline')
    expect(restoreBookingPreferences(null, null, null, 'week')).toMatchObject({ layout: 'calendar', calendarLayout: 'timeline', period: 'week' })
  })
  it('restores independent subviews and validates saved values', () => {
    expect(restoreBookingPreferences({ layout: 'list', grouping: 'apartments', calendarLayout: 'grid', period: 'week' }, 'dates', null, null)).toEqual({ layout: 'list', grouping: 'apartments', calendarLayout: 'grid', period: 'week' })
    expect(restoreBookingPreferences({ period: 'invalid' }, null, null, null).period).toBe('month')
  })
})
describe('calendar periods', () => {
  it.each([['2026-02-15', '2026-02-01', '2026-03-01'], ['2028-02-10', '2028-02-01', '2028-03-01'], ['2026-12-31', '2026-12-01', '2027-01-01']])('uses real month boundaries for %s', (cursor, from, to) => {
    expect(bookingCalendarRange('timeline', 'month', cursor)).toEqual({ from, to })
  })
  it('keeps grid monthly independently from timeline zoom', () => {
    expect(bookingCalendarRange('grid', 'day', '2026-10-04')).toEqual(bookingCalendarRange('grid', 'month', '2026-10-04'))
    expect(bookingCalendarRange('timeline', 'day', '2026-10-04')).toEqual({ from: '2026-10-04', to: '2026-10-05' })
  })
  it('does not skip February or drift at year boundaries', () => {
    expect(shiftCalendarCursor('month', '2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftCalendarCursor('month', '2026-03-31', -1)).toBe('2026-02-01')
    expect(shiftCalendarCursor('month', '2026-12-31', 1)).toBe('2027-01-01')
  })
  it('keeps overlapping stays in separate lanes in a monthly apartment row', () => {
    const stays = [{ id: 'a', apartmentId: 'room', checkInOn: '2026-09-29', checkOutOn: '2026-10-05' }, { id: 'b', apartmentId: 'room', checkInOn: '2026-10-03', checkOutOn: '2026-11-02' }]
    const [layout] = assignMonthWeekLanes(stays, [bookingCalendarRange('timeline', 'month', '2026-10-04')], Number.MAX_SAFE_INTEGER)
    expect(layout?.laneCount).toBe(2)
    expect(layout?.segments[0]?.continuesLeft).toBe(true)
    expect(layout?.segments[1]?.continuesRight).toBe(true)
    expect(layout?.hiddenStayCount).toBe(0)
  })
})
