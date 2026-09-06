import { describe, expect, it } from 'vitest'
import { apartmentsForCleanings, buildCleaningPlan, routesForDay, unacceptedCleaningsForCleaner } from '../src/pages/work/model/work-planning'
import type { Cleaning } from '../src/entities/cleaning'

function cleaning(id: string, scheduledOn: string, status = 'assigned', assignments: Array<[string, string, number]> = [['cleaner-1', 'Анна', 0]]): Cleaning {
  return {
    id,
    status,
    scheduledOn,
    checklist: [],
    hasProblem: false,
    problemDescription: '',
    apartmentId: `apartment-${id}`,
    apartment: { name: `A-${id}`, managers: [{ id: 'manager-1', name: 'Manager' }], hotel: { name: 'Hotel', address: 'Address', latitude: '1', longitude: '1' } },
    assignments: assignments.map(([cleanerId, name, routePosition]) => ({ cleanerId, routePosition, acceptedAt: null, cleaner: { id: cleanerId, name } })),
    tariffSnapshot: {}
  }
}

describe('cleaning planning', () => {
  it('separates attention, horizon, later dates and history', () => {
    const plan = buildCleaningPlan([
      cleaning('today', '2026-08-11'),
      cleaning('unassigned', '2026-08-12', 'unassigned', []),
      cleaning('later', '2026-08-30'),
      cleaning('old-done', '2026-08-05', 'completed'),
      cleaning('current-done', '2026-08-12', 'completed')
    ], '2026-08-11')
    expect(plan.attention.map(item => item.id)).toEqual(['unassigned'])
    expect(plan.days.map(day => day.date)).toEqual(['2026-08-11', '2026-08-12'])
    expect(plan.later.map(item => item.id)).toEqual(['later'])
    expect(plan.history.map(item => item.id)).toEqual(['old-done'])
  })

  it('keeps unfinished past work in the plan and current/future finished work visible', () => {
    const plan = buildCleaningPlan([
      cleaning('past-active', '2026-08-05', 'in_progress'),
      cleaning('past-canceled', '2026-08-05', 'canceled'),
      cleaning('today-done', '2026-08-11', 'completed'),
      cleaning('future-done', '2026-08-20', 'completed'),
      cleaning('future-unassigned-done', '2026-08-20', 'completed', []),
    ], '2026-08-11')
    expect(plan.history.map(item => item.id)).toEqual(['past-canceled'])
    expect(plan.days.flatMap(day => day.cleanings).map(item => item.id)).toEqual(['past-active', 'today-done', 'future-done'])
    expect(plan.attention.map(item => item.id)).toEqual(['future-unassigned-done'])
  })

  it('hides current and future finished work without changing past history', () => {
    const cleanings = [
      cleaning('past-active', '2026-08-05', 'in_progress'),
      cleaning('past-completed', '2026-08-05', 'completed'),
      cleaning('past-canceled', '2026-08-06', 'canceled'),
      cleaning('today-active', '2026-08-11'),
      cleaning('today-completed', '2026-08-11', 'completed'),
      cleaning('future-canceled', '2026-08-12', 'canceled'),
      cleaning('future-completed-unassigned', '2026-08-13', 'completed', []),
      cleaning('future-active-unassigned', '2026-08-14', 'unassigned', []),
    ]
    const visiblePlan = buildCleaningPlan(cleanings, '2026-08-11')
    const filteredPlan = buildCleaningPlan(cleanings, '2026-08-11', true)

    expect(visiblePlan.days.flatMap(day => day.cleanings).map(item => item.id)).toEqual([
      'past-active',
      'today-active',
      'today-completed',
      'future-canceled',
    ])
    expect(visiblePlan.attention.map(item => item.id)).toEqual([
      'future-active-unassigned',
      'future-completed-unassigned',
    ])
    expect(filteredPlan.days.map(day => day.date)).toEqual(['2026-08-05', '2026-08-11'])
    expect(filteredPlan.days.flatMap(day => day.cleanings).map(item => item.id)).toEqual([
      'past-active',
      'today-active',
    ])
    expect(filteredPlan.attention.map(item => item.id)).toEqual(['future-active-unassigned'])
    expect(filteredPlan.history.map(item => item.id)).toEqual(['past-canceled', 'past-completed'])
    expect(filteredPlan.history).toEqual(visiblePlan.history)
    expect(routesForDay(filteredPlan.days.flatMap(day => day.cleanings)).flatMap(route => route.cleanings).map(item => item.id)).not.toContain('today-completed')
    expect(apartmentsForCleanings(filteredPlan.days.flatMap(day => day.cleanings)).flatMap(group => group.days).map(day => day.date)).not.toContain('2026-08-12')
  })

  it('duplicates a shared cleaning in each cleaner route and sorts by position', () => {
    const shared = cleaning('shared', '2026-08-11', 'assigned', [['cleaner-1', 'Анна', 2], ['cleaner-2', 'Борис', 0]])
    const first = cleaning('first', '2026-08-11', 'assigned', [['cleaner-1', 'Анна', 0]])
    const routes = routesForDay([shared, first])
    expect(routes.find(route => route.cleanerId === 'cleaner-1')?.cleanings.map(item => item.id)).toEqual(['first', 'shared'])
    expect(routes.find(route => route.cleanerId === 'cleaner-2')?.cleanings.map(item => item.id)).toEqual(['shared'])
  })

  it('collects only active cleanings awaiting the current cleaner acceptance', () => {
    const later = cleaning('later', '2026-08-12')
    const first = cleaning('first', '2026-08-11')
    const accepted = cleaning('accepted', '2026-08-11')
    accepted.assignments[0]!.acceptedAt = '2026-08-10T12:00:00.000Z'
    const completed = cleaning('completed', '2026-08-11', 'completed')
    const anotherCleaner = cleaning('another-cleaner', '2026-08-11', 'assigned', [['cleaner-2', 'Борис', 0]])

    expect(unacceptedCleaningsForCleaner([later, accepted, completed, anotherCleaner, first], 'cleaner-1').map(item => item.id)).toEqual(['first', 'later'])
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

  it('filters finished cleanings from apartment groups when requested', () => {
    const done = cleaning('done', '2026-08-11', 'completed')
    expect(apartmentsForCleanings([done]).flatMap(group => group.days.flatMap(day => day.cleanings)).map(item => item.id)).toEqual(['done'])
    expect(apartmentsForCleanings([done], false)).toEqual([])
  })
})
