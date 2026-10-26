import type { DashboardOperationsResponse, OperationsApartment, OperationsArrival, OperationsAttention, OperationsEmployee, OperationsReason } from '@contracts/dashboard-operations'

type Stay = { id: string; apartmentId: string; checkInOn: string; checkOutOn: string; adultCount: number | null; childCount: number | null; apartment: OperationsApartment }
type Cleaning = {
  id: string; apartmentId: string; stayId: string | null; scheduledOn: string; status: string; isUrgent: boolean
  completedAt: Date | string | null; apartment: OperationsApartment
  assignments: Array<{ cleanerId: string; acceptedAt: Date | string | null; cleaner: { name: string } }>
  guestPreparation: { stayId: string | null; checkInOn: string | null; guestCount: number; capturedAt: Date | string } | null
}
type Task = { id: string; apartmentId: string; title: string; dueOn: string | null; status: string; assigneeId: string | null; assignee: { name: string } | null; apartment: OperationsApartment }
type Problem = { id: string; apartmentId: string; description: string; origin: string; cleaningId: string | null }
export type OperationsInput = { stays: Stay[]; cleanings: Cleaning[]; tasks: Task[]; problems: Problem[] }

export function operationsDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function shiftOperationsDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
const unfinished = (status: string) => !['completed', 'canceled'].includes(status)
const unaccepted = (c: Cleaning) => c.status === 'assigned' && c.assignments.length > 0 && !c.assignments.some(a => a.acceptedAt)
const cleaningHref = (id: string) => `/cleanings/${encodeURIComponent(id)}`
function cleaningAction(cleaning: Cleaning): OperationsAttention['action'] {
  return unfinished(cleaning.status) && !cleaning.assignments.length
    ? { kind: 'assign', href: `/work?cleaningId=${encodeURIComponent(cleaning.id)}` }
    : { kind: 'open', href: cleaningHref(cleaning.id) }
}

export function buildOperations(input: OperationsInput, now = new Date()): Omit<DashboardOperationsResponse, 'problems'> {
  const today = operationsDate(now)
  const end = shiftOperationsDate(today, 7)
  const cleanings = input.cleanings.filter(c => c.status !== 'canceled')
  const incoming = input.stays.filter(s => s.checkInOn >= today && s.checkInOn < end)
  const arrivals: OperationsArrival[] = incoming.map((stay): OperationsArrival => {
    const priorStays = input.stays.filter(s => s.apartmentId === stay.apartmentId && s.id !== stay.id && s.checkInOn < stay.checkInOn)
    const previousDeparture = priorStays.reduce((latest, s) => s.checkOutOn > latest ? s.checkOutOn : latest, '')
    // A snapshot for this exact stay is the only evidence of completed preparation.
    // For planned work, use a cleaning in the vacant interval before this arrival.
    const candidates = cleanings.filter(c => {
      if (c.apartmentId !== stay.apartmentId || c.scheduledOn > stay.checkInOn || c.scheduledOn < previousDeparture) return false
      if (c.status !== 'completed') {
        // A stay-linked cleaning may belong to the departing stay; the apartment/date interval is authoritative.
        return !c.guestPreparation || c.guestPreparation.stayId === stay.id
      }
      const snapshot = c.guestPreparation
      if (!snapshot || snapshot.stayId !== stay.id || snapshot.checkInOn !== stay.checkInOn || !c.completedAt) return false
      const completedOn = operationsDate(new Date(c.completedAt))
      const capturedOn = operationsDate(new Date(snapshot.capturedAt))
      return completedOn >= previousDeparture && completedOn <= stay.checkInOn && capturedOn >= previousDeparture && capturedOn <= stay.checkInOn
    })
    // Multiple planned or completed candidates do not establish a single preparation state.
    const completed = candidates.filter(c => c.status === 'completed').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))
    const planned = candidates.filter(c => c.status !== 'completed')
    const cleaning = planned.length === 1 ? planned[0] : planned.length === 0 ? completed[0] : undefined
    const state = !cleaning ? 'unknown' : cleaning.status === 'completed' ? 'completed' : cleaning.status === 'in_progress' ? 'in_progress' : cleaning.assignments.length ? 'assigned' : 'unassigned'
    const problems = input.problems.filter(p => p.apartmentId === stay.apartmentId)
    const guestCount = stay.adultCount === null || stay.childCount === null ? null : stay.adultCount + stay.childCount
    const reasons: OperationsReason[] = []
    if (state !== 'completed') reasons.push('preparation')
    if (cleaning && unaccepted(cleaning)) reasons.push('unaccepted')
    if (guestCount !== null && cleaning?.guestPreparation && guestCount !== cleaning.guestPreparation.guestCount) reasons.push('guest_count')
    if (problems.some(p => p.origin === 'guest_count_change') && !reasons.includes('guest_count')) reasons.push('guest_count')
    if (problems.length) reasons.push('problem')
    if (guestCount === null) reasons.push('guests_unknown')
    return { id: stay.id, apartment: stay.apartment, date: stay.checkInOn, turnover: input.stays.some(s => s.id !== stay.id && s.apartmentId === stay.apartmentId && s.checkOutOn === stay.checkInOn), guestCount, state, reasons, cleaningId: cleaning?.id ?? null,
      href: cleaning ? cleaningHref(cleaning.id) : `/work?apartmentId=${encodeURIComponent(stay.apartmentId)}`, problems: problems.map(p => ({ id: p.id, description: p.description })) }
  }).sort((a, b) => a.date.localeCompare(b.date) || Number(b.reasons.length > 0) - Number(a.reasons.length > 0) || a.apartment.name.localeCompare(b.apartment.name) || a.id.localeCompare(b.id))

  const priorities = new Map<string, OperationsAttention & { priority: number }>()
  for (const a of arrivals.filter(a => a.date === today && a.reasons.length)) {
    const id = a.cleaningId ? `cleaning:${a.cleaningId}` : `stay:${a.id}`
    const cleaning = cleanings.find(c => c.id === a.cleaningId)
    const prepared = cleaning?.guestPreparation?.guestCount
    priorities.set(id, {
      id, apartment: a.apartment, date: a.date, title: null, reasons: [...a.reasons], href: a.href, priority: 0,
      category: 'arrivals', arrivalToday: true,
      assigneeNames: cleaning?.assignments.map(assignment => assignment.cleaner.name) ?? [],
      preparation: prepared !== undefined && a.guestCount !== null && prepared !== a.guestCount ? { prepared, expected: a.guestCount } : null,
      action: cleaning && unfinished(cleaning.status) ? cleaningAction(cleaning) : { kind: 'review', href: a.href }
    })
  }
  for (const c of cleanings.filter(c => unfinished(c.status))) {
    const reasons: OperationsReason[] = []
    if (c.scheduledOn < today) reasons.push('overdue')
    if (c.scheduledOn === today && !c.assignments.length) reasons.push('unassigned')
    if (c.scheduledOn === today && unaccepted(c)) reasons.push('unaccepted')
    if (!reasons.length) continue
    const id = `cleaning:${c.id}`
    const previous = priorities.get(id)
    priorities.set(id, {
      id, apartment: c.apartment, date: previous?.date ?? c.scheduledOn, title: null,
      reasons: [...new Set([...(previous?.reasons ?? []), ...reasons])], href: cleaningHref(c.id),
      priority: previous?.priority ?? (reasons.includes('overdue') ? 1 : reasons.includes('unassigned') ? 2 : 3),
      category: previous?.category ?? (reasons.includes('overdue') ? 'overdue' : 'assignments'),
      arrivalToday: previous?.arrivalToday ?? false,
      assigneeNames: c.assignments.map(assignment => assignment.cleaner.name),
      preparation: previous?.preparation ?? null, action: cleaningAction(c)
    })
  }
  for (const task of input.tasks.filter(t => unfinished(t.status))) {
    const reason = task.status === 'resolved' ? 'review' : task.dueOn && task.dueOn < today ? 'overdue' : null
    if (reason) priorities.set(`task:${task.id}`, {
      id: `task:${task.id}`, apartment: task.apartment, date: task.dueOn, title: task.title, reasons: [reason],
      href: `/tasks/${encodeURIComponent(task.id)}`, priority: reason === 'review' ? 4 : 1,
      category: reason === 'review' ? 'review' : 'overdue', arrivalToday: false,
      assigneeNames: task.assignee ? [task.assignee.name] : [], preparation: null,
      action: { kind: reason === 'review' ? 'review' : 'open', href: `/tasks/${encodeURIComponent(task.id)}` }
    })
  }
  const dayCleanings = cleanings.filter(c => c.scheduledOn === today)
  const team = new Map<string, OperationsEmployee>()
  function employee(id: string, name: string) {
    let row = team.get(id)
    if (!row) { row = { id, name, completed: 0, remaining: 0, urgent: 0, unaccepted: 0, tasks: 0 }; team.set(id, row) }
    return row
  }
  for (const c of dayCleanings) for (const a of c.assignments) {
    const row = employee(a.cleanerId, a.cleaner.name)
    if (c.status === 'completed') row.completed++
    else { row.remaining++; if (c.isUrgent) row.urgent++; if (unaccepted(c)) row.unaccepted++ }
  }
  for (const task of input.tasks.filter(t => unfinished(t.status) && t.dueOn === today && t.assigneeId)) {
    employee(task.assigneeId!, task.assignee?.name ?? '').tasks++
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftOperationsDate(today, index)
    const rows = cleanings.filter(c => c.scheduledOn === date)
    const dailyArrivals = incoming.filter(s => s.checkInOn === date)
    return { date, assigned: rows.filter(c => c.status === 'completed' || c.assignments.length > 0).length,
      unassigned: rows.filter(c => c.status !== 'completed' && !c.assignments.length).length, arrivals: dailyArrivals.length,
      turnovers: new Set(dailyArrivals.filter(s => input.stays.some(previous => previous.apartmentId === s.apartmentId && previous.id !== s.id && previous.checkOutOn === date)).map(s => s.apartmentId)).size }
  })
  return { today, generatedAt: now.toISOString(),
    attention: [...priorities.values()].sort((a, b) => a.priority - b.priority || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.id.localeCompare(b.id)).map(({ priority: _, ...item }) => item),
    summary: { total: dayCleanings.length, completed: dayCleanings.filter(c => c.status === 'completed').length, inProgress: dayCleanings.filter(c => c.status === 'in_progress').length,
      notStarted: dayCleanings.filter(c => ['assigned', 'unassigned'].includes(c.status)).length, arrivals: days[0]!.arrivals, turnovers: days[0]!.turnovers },
    team: [...team.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), days, arrivals }
}
