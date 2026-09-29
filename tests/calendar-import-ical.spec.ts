import { describe, expect, it } from 'vitest'
import { parseIcal } from '../server/modules/calendar-import/ical'

describe('parseIcal', () => {
  it('reads date-only stays, unfolds lines, and unescapes summaries', () => {
    const events = parseIcal([
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:booking-1', 'DTSTART;VALUE=DATE:20261002', 'DTEND;VALUE=DATE:20261005',
      'SUMMARY:Mountain\\, view', ' note', 'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n'))
    expect(events).toEqual([{ uid: 'booking-1', checkInOn: '2026-10-02', checkOutOn: '2026-10-05', summary: 'Mountain, viewnote' }])
  })

  it('ignores canceled, invalid, and duplicate events', () => {
    const event = (uid: string, start: string, end: string, status = 'CONFIRMED') => [
      'BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `STATUS:${status}`, 'END:VEVENT'
    ].join('\n')
    const events = parseIcal([
      event('cancelled', '20261002', '20261004', 'CANCELLED'),
      event('bad-date', '20260231', '20260303'),
      event('backwards', '20261005', '20261004'),
      event('good', '20261002', '20261005'),
      event('good', '20261003', '20261006')
    ].join('\n'))
    expect(events).toEqual([{ uid: 'good', checkInOn: '2026-10-03', checkOutOn: '2026-10-06', summary: '' }])
  })
})
