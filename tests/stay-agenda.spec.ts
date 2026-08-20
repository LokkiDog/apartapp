import { describe, expect, it } from 'vitest'
import { createStayAgenda, stayAgendaQueryFrom, type StayAgendaSource } from '../src/pages/calendar/model/stay-agenda'

function stay(id: string, checkInOn: string, checkOutOn: string): StayAgendaSource {
  return { id, checkInOn, checkOutOn }
}

describe('stay agenda', () => {
  const today = '2026-08-20'

  it('starts the API query one day earlier so departures today are included', () => {
    expect(stayAgendaQueryFrom(today)).toBe('2026-08-19')
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
})
