import { describe, expect, it } from 'vitest'
import { activeCleaning, activeTask, currentDashboardMonth, dateInDashboardMonth, isDashboardMonth, problemDashboardRecord, shiftDashboardMonth, sortDashboardRecords, stayInDashboardMonth, undatedDashboardRecord } from '../src/pages/dashboard/model/dashboard-month'

describe('dashboard month model', () => {
  it('validates and shifts calendar months across years', () => {
    expect(isDashboardMonth('2026-08')).toBe(true)
    expect(isDashboardMonth('2026-13')).toBe(false)
    expect(shiftDashboardMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftDashboardMonth('2027-01', -1)).toBe('2026-12')
    expect(currentDashboardMonth(new Date('2026-08-12T12:00:00Z'))).toBe('2026-08')
  })

  it('includes a stay when either arrival or departure is in the month', () => {
    expect(stayInDashboardMonth({ checkInOn: '2026-07-30', checkOutOn: '2026-08-02' }, '2026-08')).toBe(true)
    expect(stayInDashboardMonth({ checkInOn: '2026-07-30', checkOutOn: '2026-07-31' }, '2026-08')).toBe(false)
  })

  it('keeps active statuses and undated work separate', () => {
    expect(activeCleaning('assigned')).toBe(true)
    expect(activeCleaning('completed')).toBe(false)
    expect(activeTask('open')).toBe(true)
    expect(activeTask('completed')).toBe(false)
    expect(undatedDashboardRecord({ scheduledOn: null, dueOn: null })).toBe(true)
    expect(dateInDashboardMonth('2026-08-15', '2026-08')).toBe(true)
  })

  it('shows dated problems for the selected month and sorts records', () => {
    expect(problemDashboardRecord({ hasProblem: true, scheduledOn: '2026-08-03' }, '2026-08')).toBe(true)
    expect(problemDashboardRecord({ hasProblem: true, scheduledOn: '2026-07-03' }, '2026-08')).toBe(false)
    expect(sortDashboardRecords([{ dueOn: '2026-08-20' }, { dueOn: '2026-08-02' }]).map(item => item.dueOn)).toEqual(['2026-08-02', '2026-08-20'])
  })
})
