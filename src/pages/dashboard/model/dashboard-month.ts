export type DashboardMonthRecord = {
  scheduledOn?: string | null
  dueOn?: string | null
  hasProblem?: boolean
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const ACTIVE_CLEANING_STATUSES = new Set(['unassigned', 'assigned', 'in_progress'])
const ACTIVE_TASK_STATUSES = new Set(['open', 'in_progress'])

export function isDashboardMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value)
}

export function currentDashboardMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit' }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : date.toISOString().slice(0, 7)
}

export function dashboardMonthLabel(month: string) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Sofia' }).format(new Date(`${month}-01T12:00:00Z`))
}

export function shiftDashboardMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function dateInDashboardMonth(value: string | null | undefined, month: string) {
  return Boolean(value && value.startsWith(`${month}-`))
}

export function stayInDashboardMonth(stay: { checkInOn: string; checkOutOn: string }, month: string) {
  return dateInDashboardMonth(stay.checkInOn, month) || dateInDashboardMonth(stay.checkOutOn, month)
}

export function activeCleaning(status: string) {
  return ACTIVE_CLEANING_STATUSES.has(status)
}

export function activeTask(status: string) {
  return ACTIVE_TASK_STATUSES.has(status)
}

export function datedDashboardRecord(record: DashboardMonthRecord, month: string) {
  return dateInDashboardMonth(record.scheduledOn ?? record.dueOn, month)
}

export function undatedDashboardRecord(record: DashboardMonthRecord) {
  return !record.scheduledOn && !record.dueOn
}

export function problemDashboardRecord(record: DashboardMonthRecord, month: string) {
  return Boolean(record.hasProblem && datedDashboardRecord(record, month))
}

export function sortDashboardRecords<T extends DashboardMonthRecord>(records: T[]) {
  return [...records].sort((left, right) => {
    const leftDate = left.scheduledOn ?? left.dueOn ?? '9999-12-31'
    const rightDate = right.scheduledOn ?? right.dueOn ?? '9999-12-31'
    return leftDate.localeCompare(rightDate)
  })
}
