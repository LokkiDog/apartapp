import { describe, expect, it } from 'vitest'
import { matchesDashboardCleaning, readDashboardWorkFilter } from '../src/pages/work/model/dashboard-filter'
import { buildOperations, operationsDate, shiftOperationsDate, type OperationsInput } from '../server/modules/dashboard/operations-model'

const now = new Date('2026-10-26T09:00:00Z')
const apartment = { name: 'A1', hotel: { name: 'Hotel' } }
const assignment = (id = 'worker-1', acceptedAt: string | null = null) => ({ cleanerId: id, cleaner: { name: id }, acceptedAt })
const stay = (id = 'arrival', checkInOn = '2026-10-26', checkOutOn = '2026-10-29'): OperationsInput['stays'][number] => ({ id, apartmentId: 'apartment-1', checkInOn, checkOutOn, adultCount: 2, childCount: 0, apartment })
const cleaning = (id: string, overrides: Partial<OperationsInput['cleanings'][number]> = {}): OperationsInput['cleanings'][number] => ({
  id, apartmentId: 'apartment-1', stayId: null, scheduledOn: '2026-10-26', status: 'assigned', isUrgent: false, completedAt: null,
  apartment, assignments: [assignment()], guestPreparation: null, ...overrides
})
const input = (overrides: Partial<OperationsInput> = {}): OperationsInput => ({ stays: [], cleanings: [], tasks: [], problems: [], ...overrides })

describe('operations dashboard', () => {
  it('uses Sofia calendar boundaries, including DST and month rollover', () => {
    expect(operationsDate(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-26')
    expect(operationsDate(new Date('2026-06-01T21:30:00Z'))).toBe('2026-06-02')
    expect(shiftOperationsDate('2026-10-31', 1)).toBe('2026-11-01')
    expect(buildOperations(input(), now).days.map(d => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('counts joint assignments once overall and once per employee; excludes canceled and overdue work from today', () => {
    const result = buildOperations(input({ cleanings: [
      cleaning('joint', { isUrgent: true, assignments: [assignment(), assignment('worker-2')] }),
      cleaning('done', { status: 'completed', assignments: [assignment()], completedAt: now }),
      cleaning('progress', { status: 'in_progress', assignments: [assignment('worker-2', now.toISOString())] }),
      cleaning('unassigned', { status: 'unassigned', assignments: [] }),
      cleaning('canceled', { status: 'canceled' }),
      cleaning('old', { scheduledOn: '2026-10-25' }),
      cleaning('done-no-assignees', { status: 'completed', assignments: [], completedAt: now })
    ] }), now)
    expect(result.summary).toEqual({ total: 5, completed: 2, inProgress: 1, notStarted: 2, arrivals: 0, turnovers: 0 })
    expect(result.days[0]).toMatchObject({ assigned: 4, unassigned: 1 })
    expect(result.team).toEqual([
      { id: 'worker-1', name: 'worker-1', completed: 1, remaining: 1, urgent: 1, unaccepted: 1, tasks: 0 },
      { id: 'worker-2', name: 'worker-2', completed: 0, remaining: 2, urgent: 1, unaccepted: 1, tasks: 0 }
    ])
    expect(result.attention.map(a => a.id)).toEqual(['cleaning:old', 'cleaning:unassigned', 'cleaning:joint'])
    expect(result.attention.find(a => a.id === 'cleaning:joint')).toMatchObject({ category: 'assignments', assigneeNames: ['worker-1', 'worker-2'], action: { kind: 'open', href: '/cleanings/joint' } })
    expect(result.attention.find(a => a.id === 'cleaning:old')?.category).toBe('overdue')
  })

  it('counts unfinished urgent work once per day and matches the dated work filter', () => {
    const cleanings = [
      cleaning('joint', { isUrgent: true, assignments: [assignment(), assignment('worker-2')] }),
      cleaning('progress', { isUrgent: true, status: 'in_progress' }),
      cleaning('unassigned', { isUrgent: true, status: 'unassigned', assignments: [] }),
      cleaning('done', { isUrgent: true, status: 'completed' }),
      cleaning('canceled', { isUrgent: true, status: 'canceled' }),
      cleaning('regular'),
      cleaning('tomorrow', { isUrgent: true, scheduledOn: '2026-10-27' }),
      cleaning('outside-week', { isUrgent: true, scheduledOn: '2026-11-02' })
    ]
    const result = buildOperations(input({ cleanings }), now)
    expect(result.days.map(day => day.urgent)).toEqual([3, 1, 0, 0, 0, 0, 0])
    for (const day of result.days) {
      const filter = readDashboardWorkFilter({ date: day.date, filter: 'urgent' })
      expect(cleanings.filter(row => matchesDashboardCleaning(row, filter, result.today))).toHaveLength(day.urgent)
    }
  })

  it('treats acceptance by any assigned employee as accepted', () => {
    const result = buildOperations(input({ cleanings: [cleaning('joint', { assignments: [assignment(), assignment('worker-2', now.toISOString())] })] }), now)
    expect(result.attention).toEqual([])
    expect(result.team.map(p => p.unaccepted)).toEqual([0, 0])
  })

  it('merges arrival and work warnings, orders arrivals first and separates tasks awaiting review from overdue tasks', () => {
    const task = { id: 'late', apartmentId: 'apartment-1', apartment, title: 'Repair', dueOn: '2026-10-20', status: 'open', assigneeId: 'worker-1', assignee: { name: 'worker-1' } }
    const result = buildOperations(input({ stays: [stay(), stay('previous', '2026-10-20', '2026-10-26')],
      cleanings: [cleaning('arrival-cleaning', { status: 'unassigned', assignments: [] }), cleaning('old', { apartmentId: 'other', scheduledOn: '2026-10-25' })],
      tasks: [task, { ...task, id: 'review', status: 'resolved', dueOn: null }, { ...task, id: 'canceled', status: 'canceled' }]
    }), now)
    expect(result.summary.turnovers).toBe(1)
    expect(result.arrivals[0]).toMatchObject({ state: 'unassigned', turnover: true })
    expect(result.attention[0]).toMatchObject({ id: 'cleaning:arrival-cleaning', reasons: ['preparation', 'unassigned'], category: 'arrivals', arrivalToday: true, action: { kind: 'assign', href: '/work?cleaningId=arrival-cleaning' } })
    expect(result.attention.map(a => a.id)).toEqual(['cleaning:arrival-cleaning', 'task:late', 'cleaning:old', 'task:review'])
    expect(result.attention.at(-1)).toMatchObject({ reasons: ['review'], category: 'review', action: { kind: 'review', href: '/tasks/review' } })
  })

  it('recognizes only a completed snapshot for the exact arrival after the previous stay', () => {
    const done = cleaning('done', { status: 'completed', scheduledOn: '2026-10-25', completedAt: '2026-10-25T12:00:00Z', guestPreparation: { stayId: 'arrival', checkInOn: '2026-10-26', guestCount: 2, capturedAt: '2026-10-25T12:00:00Z' } })
    const prepared = (row = done, previousDeparture = '2026-10-25') => buildOperations(input({ stays: [stay(), stay('previous', '2026-10-20', previousDeparture)], cleanings: [row] }), now).arrivals[0]!
    expect(prepared()).toMatchObject({ state: 'completed', reasons: [], cleaningId: 'done' })
    expect(prepared({ ...done, guestPreparation: null }).state).toBe('unknown')
    expect(prepared({ ...done, guestPreparation: { ...done.guestPreparation!, stayId: 'another-arrival' } }).state).toBe('unknown')
    expect(prepared(done, '2026-10-26').state).toBe('unknown')
    expect(prepared({ ...done, completedAt: '2026-10-24T12:00:00Z' }).state).toBe('unknown')
    expect(prepared({ ...done, guestPreparation: { ...done.guestPreparation!, checkInOn: '2026-10-27' } }).state).toBe('unknown')
  })

  it('does not claim readiness when planned cleanings are ambiguous or canceled', () => {
    const result = buildOperations(input({ stays: [stay()], cleanings: [cleaning('one'), cleaning('two'), cleaning('canceled', { status: 'canceled' })] }), now)
    expect(result.arrivals[0]).toMatchObject({ state: 'unknown', cleaningId: null, href: '/work?apartmentId=apartment-1' })
    expect(result.attention.find(item => item.id === 'stay:arrival')?.action).toEqual({ kind: 'review', href: '/work?apartmentId=apartment-1' })
  })

  it('includes imported arrivals without guest counts and reports changed preparation and problems', () => {
    const done = cleaning('done', { status: 'completed', completedAt: now, guestPreparation: { stayId: 'arrival', checkInOn: '2026-10-26', guestCount: 3, capturedAt: now } })
    const problem = { id: 'problem', apartmentId: 'apartment-1', cleaningId: 'done', description: 'Repair needed', origin: 'manual' }
    const result = buildOperations(input({ stays: [stay(), { ...stay('ical', '2026-10-27'), apartmentId: 'other', adultCount: null, childCount: null }], cleanings: [done], problems: [problem] }), now)
    expect(result.arrivals[0]).toMatchObject({ state: 'completed', reasons: ['guest_count', 'problem'], problems: [{ id: 'problem', description: 'Repair needed' }] })
    expect(result.attention[0]).toMatchObject({ category: 'arrivals', arrivalToday: true, preparation: { prepared: 3, expected: 2 }, action: { kind: 'review', href: '/cleanings/done' } })
    expect(result.arrivals[1]).toMatchObject({ id: 'ical', guestCount: null, state: 'unknown', reasons: ['preparation', 'guests_unknown'] })
    expect(result.days[1]?.arrivals).toBe(1)
  })
})
