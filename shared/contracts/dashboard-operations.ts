export type PreparationState = 'unknown' | 'unassigned' | 'assigned' | 'in_progress' | 'completed'
export type OperationsReason = 'preparation' | 'overdue' | 'unassigned' | 'unaccepted' | 'review' | 'guest_count' | 'problem' | 'guests_unknown'
export type OperationsApartment = { name: string; hotel: { name: string } }
export type OperationsArrival = {
  id: string
  apartment: OperationsApartment
  date: string
  turnover: boolean
  guestCount: number | null
  state: PreparationState
  reasons: OperationsReason[]
  cleaningId: string | null
  href: string
  problems: Array<{ id: string; description: string }>
}
export type AttentionCategory = 'arrivals' | 'assignments' | 'overdue' | 'review'
export type OperationsAttention = {
  id: string
  apartment: OperationsApartment
  date: string | null
  title: string | null
  reasons: OperationsReason[]
  href: string
  category: AttentionCategory
  arrivalToday: boolean
  assigneeNames: string[]
  preparation: { prepared: number; expected: number } | null
  action: { kind: 'assign' | 'open' | 'review'; href: string }
}
export type OperationsDay = { date: string; assigned: number; unassigned: number; urgent: number; arrivals: number; turnovers: number }
export type OperationsEmployee = {
  id: string; name: string; completed: number; remaining: number; urgent: number; unaccepted: number; tasks: number
}
export type DashboardOperationsResponse = {
  today: string
  generatedAt: string
  problems: { openCount: number }
  attention: OperationsAttention[]
  summary: { total: number; completed: number; inProgress: number; notStarted: number; arrivals: number; turnovers: number }
  team: OperationsEmployee[]
  days: OperationsDay[]
  arrivals: OperationsArrival[]
}
