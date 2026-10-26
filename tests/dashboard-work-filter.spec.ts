import { describe, expect, it } from 'vitest'
import { matchesDashboardCleaning, matchesDashboardTask, readDashboardWorkFilter } from '../src/pages/work/model/dashboard-filter'
const worker = '00000000-0000-4000-8000-000000000001'
const base = { status: 'assigned', scheduledOn: '2026-10-26', isUrgent: true, assignments: [{ cleanerId: worker, acceptedAt: null }] }
describe('dashboard work navigation', () => {
  it('combines date, employee and status while accepting joint work only once', () => {
    const filter = readDashboardWorkFilter({ date: '2026-10-26', cleanerId: worker, filter: 'unaccepted' })
    expect(matchesDashboardCleaning(base, filter, '2026-10-26')).toBe(true)
    expect(matchesDashboardCleaning({ ...base, scheduledOn: '2026-10-27' }, filter, '2026-10-26')).toBe(false)
    expect(matchesDashboardCleaning({ ...base, assignments: [{ cleanerId: 'other', acceptedAt: null }] }, filter, '2026-10-26')).toBe(false)
    expect(matchesDashboardCleaning({ ...base, assignments: [...base.assignments, { cleanerId: 'other', acceptedAt: '2026-10-26T08:00:00Z' }] }, filter, '2026-10-26')).toBe(false)
  })
  it.each([
    ['completed', 'completed', true], ['completed', 'assigned', false], ['in_progress', 'in_progress', true],
    ['not_started', 'unassigned', true], ['not_started', 'in_progress', false], ['urgent', 'completed', false],
    ['assigned', 'completed', true], ['unassigned', 'completed', false], ['overdue', 'in_progress', true]
  ])('filters %s with status %s', (filter, status, expected) => {
    expect(matchesDashboardCleaning({ ...base, status, scheduledOn: '2026-10-25' }, readDashboardWorkFilter({ filter }), '2026-10-26')).toBe(expected)
  })
  it('opens an unconfirmed arrival’s apartment work without creating a departure cleaning', () => {
    const filter = readDashboardWorkFilter({ apartmentId: worker })
    expect(matchesDashboardCleaning({ ...base, apartmentId: worker }, filter, '2026-10-26')).toBe(true)
    expect(matchesDashboardCleaning({ ...base, apartmentId: 'other' }, filter, '2026-10-26')).toBe(false)
    expect(matchesDashboardTask({ apartmentId: worker, dueOn: null, assigneeId: null }, filter)).toBe(true)
  })
  it('rejects invalid query values and filters tasks by date and assignee', () => {
    expect(readDashboardWorkFilter({ date: '2026-02-30', cleanerId: 'broken', filter: ['urgent'] })).toEqual({ apartmentId: null, date: null, cleanerId: null, filter: null })
    const filter = readDashboardWorkFilter({ date: '2026-10-26', cleanerId: worker })
    expect(matchesDashboardTask({ dueOn: '2026-10-26', assigneeId: worker }, filter)).toBe(true)
    expect(matchesDashboardTask({ dueOn: null, assigneeId: worker }, filter)).toBe(false)
    expect(matchesDashboardTask({ dueOn: '2026-10-26', assigneeId: 'other' }, filter)).toBe(false)
  })
})
