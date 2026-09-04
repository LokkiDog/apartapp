import { describe, expect, it } from 'vitest'
import { createStayAgenda, filterStayAgenda, isPastStay, stayAgendaQueryFrom, stayHistoryQueryFrom, type StayAgendaSource } from '../src/pages/calendar/model/stay-agenda'
import { bookingsForApartment, calendarRange, migrateCalendarView } from '../src/pages/calendar/model/calendar-view'

function stay(id: string, checkInOn: string, checkOutOn: string): StayAgendaSource {
  return { id, checkInOn, checkOutOn }
}

describe('stay agenda', () => {
  const today = '2026-08-20'

  it('starts the API query one day earlier so departures today are included', () => {
    expect(stayAgendaQueryFrom(today)).toBe('2026-08-19')
  })

  it('builds rolling ten-day history ranges and keeps today current', () => {
    expect(stayHistoryQueryFrom(today, 10)).toBe('2026-08-09')
    expect(stayHistoryQueryFrom(today, 20)).toBe('2026-07-30')
    expect(isPastStay(stay('yesterday', '2026-08-18', '2026-08-19'), today)).toBe(true)
    expect(isPastStay(stay('today', '2026-08-19', today), today)).toBe(false)
  })

  it('keeps all categories in the fixed operational order', () => {
    const agenda = createStayAgenda([
      stay('continuing', '2026-08-18', '2026-08-22'),
      stay('arrival', today, '2026-08-23'),
      stay('departure', '2026-08-17', today)
    ], today)

    expect(agenda[0]?.date).toBe(today)
    expect(agenda[0]?.categories.map(category => [category.status, category.items.map(item => item.stay.id)])).toEqual([
      ['departure', ['departure']],
      ['arrival', ['arrival']],
      ['staying', ['continuing']]
    ])
    expect(agenda[0]?.counts).toEqual({ departure: 1, arrival: 1, staying: 1 })
    expect(agenda[0]?.totalCount).toBe(3)
  })

  it('preserves empty categories', () => {
    const agenda = createStayAgenda([stay('arrival', today, '2026-08-22')], today)

    expect(agenda[0]?.categories.map(category => [category.status, category.items.length])).toEqual([
      ['departure', 0],
      ['arrival', 1],
      ['staying', 0]
    ])
  })

  it('assigns each stay to exactly one category on each date', () => {
    const agenda = createStayAgenda([stay('booking', today, '2026-08-22')], today)
    expect(agenda.map(day => [day.date, day.categories.flatMap(category => category.items.map(item => item.status))])).toEqual([
      ['2026-08-20', ['arrival']],
      ['2026-08-21', ['staying']],
      ['2026-08-22', ['departure']]
    ])
  })

  it('omits past stays and dates without activity', () => {
    const agenda = createStayAgenda([
      stay('past', '2026-08-10', '2026-08-12'),
      stay('future', '2026-08-23', '2026-08-24')
    ], today)
    expect(agenda.map(day => day.date)).toEqual(['2026-08-23', '2026-08-24'])
  })

  it('filters agenda categories and recalculates visible day totals', () => {
    const agenda = createStayAgenda([
      stay('arrival', today, '2026-08-23'),
      stay('departure', '2026-08-17', today),
      stay('continuing', '2026-08-18', '2026-08-22')
    ], today)
    const filtered = filterStayAgenda(agenda, ['arrival'])
    expect(filtered[0]?.categories.map(category => category.status)).toEqual(['arrival'])
    expect(filtered[0]?.totalCount).toBe(1)
    expect(filterStayAgenda(agenda, []).map(day => day.date)).toEqual([])
  })

  it('supports calendar migration, day ranges and apartment sorting', () => {
    expect(migrateCalendarView('agenda')).toEqual({ bookingView: 'dates', calendarPeriod: 'month' })
    expect(migrateCalendarView('week')).toEqual({ bookingView: 'calendar', calendarPeriod: 'week' })
    expect(calendarRange('day', today)).toEqual({ from: today, to: '2026-08-21' })
    expect(bookingsForApartment([
      { apartmentId: 'a', checkInOn: '2026-08-23', checkOutOn: '2026-08-25' },
      { apartmentId: 'b', checkInOn: '2026-08-20', checkOutOn: '2026-08-22' },
      { apartmentId: 'a', checkInOn: '2026-08-21', checkOutOn: '2026-08-22' }
    ], 'a').map(stay => stay.checkInOn)).toEqual(['2026-08-21', '2026-08-23'])
  })
})
