import { z } from 'zod'

type Query = Record<string, unknown>
export function readDashboardWorkFilter(query: Query) {
  const date = z.iso.date().safeParse(query.date)
  const apartment = z.uuid().safeParse(query.apartmentId)
  const cleaner = z.uuid().safeParse(query.cleanerId)
  const filter = z.enum(['completed', 'in_progress', 'not_started', 'assigned', 'unassigned', 'urgent', 'unaccepted', 'overdue']).safeParse(query.filter)
  return { apartmentId: apartment.success ? apartment.data : null, date: date.success ? date.data : null, cleanerId: cleaner.success ? cleaner.data : null, filter: filter.success ? filter.data : null }
}
export type DashboardWorkFilter = ReturnType<typeof readDashboardWorkFilter>
export function matchesDashboardCleaning(c: { apartmentId?: string; status: string; scheduledOn: string; isUrgent: boolean; assignments: Array<{ cleanerId: string; acceptedAt: string | null }> }, filter: DashboardWorkFilter, today: string) {
  if (filter.apartmentId && c.apartmentId !== filter.apartmentId) return false
  if (c.status === 'canceled') return false
  if (filter.date && c.scheduledOn !== filter.date) return false
  if (filter.cleanerId && !c.assignments.some(a => a.cleanerId === filter.cleanerId)) return false
  switch (filter.filter) {
    case 'completed': return c.status === 'completed'
    case 'in_progress': return c.status === 'in_progress'
    case 'not_started': return ['assigned', 'unassigned'].includes(c.status)
    case 'assigned': return c.status === 'completed' || c.assignments.length > 0
    case 'unassigned': return c.status !== 'completed' && c.assignments.length === 0
    case 'urgent': return c.isUrgent && !['completed', 'canceled'].includes(c.status)
    case 'unaccepted': return c.status === 'assigned' && c.assignments.length > 0 && !c.assignments.some(a => a.acceptedAt)
    case 'overdue': return !['completed', 'canceled'].includes(c.status) && c.scheduledOn < today
    default: return true
  }
}
export function matchesDashboardTask(task: { apartmentId?: string; dueOn: string | null; assigneeId: string | null }, filter: DashboardWorkFilter) {
  return (!filter.apartmentId || task.apartmentId === filter.apartmentId) && (!filter.date || task.dueOn === filter.date) && (!filter.cleanerId || task.assigneeId === filter.cleanerId)
}
