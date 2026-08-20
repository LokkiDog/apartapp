import { describe, expect, it } from 'vitest'
import { apartmentsForCleanings, buildCleaningPlan, routesForDay } from '../src/pages/work/model/work-planning'
import type { Cleaning } from '../src/entities/cleaning'

function cleaning(id: string, scheduledOn: string | null, status = 'assigned', assignments: Array<[string, string, number]> = [['cleaner-1', 'Анна', 0]]): Cleaning {
  return {
    id,
    status,
    scheduledOn,
    checklist: [],
    hasProblem: false,
    problemDescription: '',
    apartmentId: `apartment-${id}`,
    apartment: { name: `A-${id}`, managerId: 'manager-1', hotel: { name: 'Hotel', address: 'Address', latitude: '1', longitude: '1' } },
    assignments: assignments.map(([cleanerId, name, routePosition]) => ({ cleanerId, routePosition, cleaner: { id: cleanerId, name } })),
    tariffSnapshot: {}
  }
}

describe('cleaning planning', () => {
  it('separates attention, horizon, later dates and history', () => {
    const plan = buildCleaningPlan([
      cleaning('today', '2026-08-11'),
      cleaning('undated', null),
      cleaning('unassigned', '2026-08-12', 'unassigned', []),
      cleaning('later', '2026-08-30'),
      cleaning('old-done', '2026-08-05', 'completed'),
      cleaning('current-done', '2026-08-12', 'completed')
    ], '2026-08-11')
    expect(plan.attention.map(item => item.id)).toEqual(['undated', 'unassigned'])
    expect(plan.days.map(day => day.date)).toEqual(['2026-08-11', '2026-08-12'])
    expect(plan.later.map(item => item.id)).toEqual(['later'])
    expect(plan.history.map(item => item.id)).toEqual(['old-done'])
  })

  it('duplicates a shared cleaning in each cleaner route and sorts by position', () => {
    const shared = cleaning('shared', '2026-08-11', 'assigned', [['cleaner-1', 'Анна', 2], ['cleaner-2', 'Борис', 0]])
    const first = cleaning('first', '2026-08-11', 'assigned', [['cleaner-1', 'Анна', 0]])
    const routes = routesForDay([shared, first])
    expect(routes.find(route => route.cleanerId === 'cleaner-1')?.cleanings.map(item => item.id)).toEqual(['first', 'shared'])
    expect(routes.find(route => route.cleanerId === 'cleaner-2')?.cleanings.map(item => item.id)).toEqual(['shared'])
  })

  it('groups scheduled cleanings by apartment and sorts dates and apartments', () => {
    const first = cleaning('z-later', '2026-08-12')
    first.apartmentId = 'apartment-z'
    first.apartment.name = 'Zeta'
    const second = cleaning('a-early', '2026-08-11')
    second.apartmentId = 'apartment-a'
    second.apartment.name = 'Alpha'
    const third = cleaning('a-later', '2026-08-14', 'assigned', [['cleaner-2', 'Борис', 1]])
    third.apartmentId = 'apartment-a'
    third.apartment.name = 'Alpha'
    const shared = cleaning('a-shared', '2026-08-13', 'assigned', [['cleaner-1', 'Анна', 0], ['cleaner-2', 'Борис', 1]])
    shared.apartmentId = 'apartment-a'
    shared.apartment.name = 'Alpha'
    const groups = apartmentsForCleanings([first, third, shared, second])
    expect(groups.map(group => group.apartment.name)).toEqual(['Alpha', 'Zeta'])
    expect(groups[0]?.days.map(day => day.date)).toEqual(['2026-08-11', '2026-08-13', '2026-08-14'])
    expect(groups[0]?.days[1]?.cleanings.map(item => item.id)).toEqual(['a-shared'])
  })

  it('keeps undated cleanings out of apartment groups and filters finished items when requested', () => {
    const undated = cleaning('undated', null)
    const done = cleaning('done', '2026-08-11', 'completed')
    expect(apartmentsForCleanings([undated, done]).flatMap(group => group.days.flatMap(day => day.cleanings)).map(item => item.id)).toEqual(['done'])
    expect(apartmentsForCleanings([done], false)).toEqual([])
  })
})
