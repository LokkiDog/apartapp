import type { Cleaning } from '#fsd/entities/cleaning'

export type CleaningDay = { date: string; cleanings: Cleaning[] }
export type CleanerRoute = { cleanerId: string; cleanerName: string; cleanings: Cleaning[] }
export type ApartmentCleaningGroup = { apartmentId: string; apartment: Cleaning['apartment']; days: CleaningDay[] }

export type CleaningPlan = {
  attention: Cleaning[]
  days: CleaningDay[]
  later: Cleaning[]
  history: Cleaning[]
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + amount)
  return localDate(value)
}

function routePosition(cleaning: Cleaning, cleanerId?: string) {
  const assignment = cleanerId ? cleaning.assignments.find(item => item.cleanerId === cleanerId) : cleaning.assignments[0]
  return assignment?.routePosition ?? Number.MAX_SAFE_INTEGER
}

export function sortRoute(cleanings: Cleaning[], cleanerId?: string) {
  return [...cleanings].sort((left, right) => routePosition(left, cleanerId) - routePosition(right, cleanerId) || left.apartment.name.localeCompare(right.apartment.name))
}

export function unacceptedCleaningsForCleaner(cleanings: Cleaning[], cleanerId: string): Cleaning[] {
  return cleanings
    .filter((cleaning) => {
      const assignment = cleaning.assignments.find((item) => item.cleanerId === cleanerId)
      return ['assigned', 'in_progress'].includes(cleaning.status) && Boolean(assignment && !assignment.acceptedAt)
    })
    .sort((left, right) => left.scheduledOn.localeCompare(right.scheduledOn) || routePosition(left, cleanerId) - routePosition(right, cleanerId) || left.apartment.name.localeCompare(right.apartment.name))
}

export function buildCleaningPlan(cleanings: Cleaning[], today = localDate(), hideFinishedFromToday = false): CleaningPlan {
  const horizon = shiftDate(today, 14)
  const attention: Cleaning[] = []
  const days = new Map<string, Cleaning[]>()
  const later: Cleaning[] = []
  const history: Cleaning[] = []
  for (const cleaning of cleanings) {
    const finished = ['completed', 'canceled'].includes(cleaning.status)
    if (finished && cleaning.scheduledOn < today) {
      history.push(cleaning)
      continue
    }
    if (hideFinishedFromToday && finished) continue
    if (!cleaning.assignments.length) {
      attention.push(cleaning)
      continue
    }
    if (!finished && cleaning.scheduledOn > horizon) {
      later.push(cleaning)
      continue
    }
    const items = days.get(cleaning.scheduledOn) ?? []
    items.push(cleaning)
    days.set(cleaning.scheduledOn, items)
  }
  return {
    attention: sortRoute(attention),
    days: [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, items]) => ({ date, cleanings: sortRoute(items) })),
    later: sortRoute(later),
    history: [...history].sort((left, right) => right.scheduledOn.localeCompare(left.scheduledOn))
  }
}

export function routesForDay(cleanings: Cleaning[], includeFinished = true): CleanerRoute[] {
  const routes = new Map<string, CleanerRoute>()
  for (const cleaning of cleanings) {
    if (!includeFinished && ['completed', 'canceled'].includes(cleaning.status)) continue
    for (const assignment of cleaning.assignments) {
      const route = routes.get(assignment.cleanerId) ?? { cleanerId: assignment.cleanerId, cleanerName: assignment.cleaner.name, cleanings: [] }
      route.cleanings.push(cleaning)
      routes.set(assignment.cleanerId, route)
    }
  }
  return [...routes.values()].sort((left, right) => left.cleanerName.localeCompare(right.cleanerName)).map(route => ({ ...route, cleanings: sortRoute(route.cleanings, route.cleanerId) }))
}

export function routesForCleanings(cleanings: Cleaning[], includeFinished = true): CleanerRoute[] {
  return routesForDay(cleanings, includeFinished)
}

export function apartmentsForCleanings(cleanings: Cleaning[], includeFinished = true): ApartmentCleaningGroup[] {
  const groups = new Map<string, { apartmentId: string; apartment: Cleaning['apartment']; days: Map<string, Cleaning[]> }>()
  for (const cleaning of cleanings) {
    if (!includeFinished && ['completed', 'canceled'].includes(cleaning.status)) continue
    const group = groups.get(cleaning.apartmentId) ?? { apartmentId: cleaning.apartmentId, apartment: cleaning.apartment, days: new Map<string, Cleaning[]>() }
    const day = group.days.get(cleaning.scheduledOn) ?? []
    day.push(cleaning)
    group.days.set(cleaning.scheduledOn, day)
    groups.set(cleaning.apartmentId, group)
  }
  return [...groups.values()]
    .sort((left, right) => left.apartment.name.localeCompare(right.apartment.name))
    .map(group => ({
      apartmentId: group.apartmentId,
      apartment: group.apartment,
      days: [...group.days.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, items]) => ({ date, cleanings: sortRoute(items) }))
    }))
}
