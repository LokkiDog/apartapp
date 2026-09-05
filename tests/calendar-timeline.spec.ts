import { describe, expect, it } from 'vitest'
import { assignMonthWeekLanes, createStaySegment, createWeekSegments, type CalendarTimelineStay } from '../src/pages/calendar/model/calendar-timeline'

function stay(id: string, apartmentId: string, checkInOn: string, checkOutOn: string): CalendarTimelineStay {
  return { id, apartmentId, checkInOn, checkOutOn }
}

describe('calendar timeline segments', () => {
  const monday = '2026-08-10'
  const nextMonday = '2026-08-17'

  it('uses a full arrival day and the first half of the departure day', () => {
    const booking = stay('one-night', 'a', '2026-08-10', '2026-08-11')
    expect(createStaySegment(booking, monday, nextMonday, [booking])).toMatchObject({
      startHalf: 0,
      endHalf: 3,
      hasActualArrival: true,
      hasActualDeparture: true,
      continuesLeft: false,
      continuesRight: false
    })
  })

  it('joins a same-day departure and arrival at the half-day boundary', () => {
    const previous = stay('previous', 'a', '2026-08-10', '2026-08-12')
    const next = stay('next', 'a', '2026-08-12', '2026-08-15')
    const segments = createWeekSegments([previous, next], monday, nextMonday)
    expect(segments.find(segment => segment.stay.id === 'previous')?.endHalf).toBe(5)
    expect(segments.find(segment => segment.stay.id === 'next')?.startHalf).toBe(5)
  })

  it('fills clipped period edges and only marks a real departure', () => {
    const fromBefore = stay('from-before', 'a', '2026-08-01', '2026-08-12')
    const beyond = stay('beyond', 'b', '2026-08-15', '2026-08-25')
    expect(createStaySegment(fromBefore, monday, nextMonday, [fromBefore])).toMatchObject({
      startHalf: 0,
      endHalf: 5,
      continuesLeft: true,
      continuesRight: false,
      hasActualDeparture: true
    })
    expect(createStaySegment(beyond, monday, nextMonday, [beyond])).toMatchObject({
      startHalf: 10,
      endHalf: 14,
      continuesLeft: false,
      continuesRight: true,
      hasActualDeparture: false
    })
  })

  it('shows a departure on the first half of the first visible day', () => {
    const booking = stay('boundary-departure', 'a', '2026-08-01', monday)
    expect(createStaySegment(booking, monday, nextMonday, [booking])).toMatchObject({
      startHalf: 0,
      endHalf: 1,
      continuesLeft: true,
      hasActualDeparture: true
    })
  })
})

describe('calendar month lanes', () => {
  const weeks = [
    { from: '2026-08-10', to: '2026-08-17' },
    { from: '2026-08-17', to: '2026-08-24' }
  ]

  it('keeps a continuing stay in the same lane when possible', () => {
    const continuing = stay('continuing', 'a', '2026-08-14', '2026-08-20')
    const layouts = assignMonthWeekLanes([continuing], weeks)
    expect(layouts[0]?.segments[0]?.lane).toBe(0)
    expect(layouts[1]?.segments[0]?.lane).toBe(0)
    expect(layouts[0]?.segments[0]).toMatchObject({ continuesRight: true, hasActualDeparture: false })
    expect(layouts[1]?.segments[0]).toMatchObject({ continuesLeft: true, hasActualDeparture: true })
  })

  it('reuses empty lanes before a continuing stay with a higher preferred lane', () => {
    const first = stay('first', 'a', '2026-08-10', '2026-08-16')
    const second = stay('second', 'b', '2026-08-10', '2026-08-15')
    const continuing = stay('continuing', 'c', '2026-08-12', '2026-08-20')
    const nextWeek = stay('next-week', 'd', '2026-08-17', '2026-08-19')

    const layouts = assignMonthWeekLanes([first, second, continuing, nextWeek], weeks)

    expect(layouts[0]?.segments.find(segment => segment.stay.id === 'continuing')?.lane).toBe(2)
    expect(layouts[1]?.segments.find(segment => segment.stay.id === 'continuing')?.lane).toBe(2)
    expect(layouts[1]?.segments.find(segment => segment.stay.id === 'next-week')?.lane).toBe(0)
  })

  it('counts unique stays hidden after the third lane for the whole week', () => {
    const bookings = Array.from({ length: 5 }, (_, index) => stay(`stay-${index}`, `apartment-${index}`, '2026-08-10', '2026-08-17'))
    const [layout] = assignMonthWeekLanes(bookings, weeks.slice(0, 1))
    expect(layout?.laneCount).toBe(5)
    expect(layout?.hiddenStayCount).toBe(2)
  })

  it('reuses a lane for non-overlapping segments', () => {
    const early = stay('early', 'a', '2026-08-10', '2026-08-12')
    const late = stay('late', 'b', '2026-08-13', '2026-08-15')
    const [layout] = assignMonthWeekLanes([early, late], weeks.slice(0, 1))
    expect(layout?.laneCount).toBe(1)
    expect(layout?.segments.map(segment => segment.lane)).toEqual([0, 0])
  })
})
