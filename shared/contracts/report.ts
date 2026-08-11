import { z } from 'zod'

const reportDateSchema = z.iso.date()

const reportPeriodSchema = z.object({
  from: reportDateSchema,
  to: reportDateSchema
}).superRefine((value, context) => {
  if (value.to < value.from) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'Дата окончания должна быть не раньше даты начала' })
    return
  }
  const days = Math.floor((Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000) + 1
  if (days > 366) context.addIssue({ code: 'custom', path: ['to'], message: 'Максимальный период отчёта — 366 дней' })
})

const apartmentIdsSchema = z.preprocess(value => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}, z.array(z.uuid({ error: 'Некорректный апартамент' })).min(1, 'Выберите хотя бы один апартамент'))

export const reportQuerySchema = z.discriminatedUnion('scope', [
  reportPeriodSchema.extend({ scope: z.literal('all') }).strict(),
  reportPeriodSchema.extend({ scope: z.literal('hotel'), hotelId: z.uuid({ error: 'Выберите апарт-отель' }) }).strict(),
  reportPeriodSchema.extend({ scope: z.literal('apartments'), apartmentIds: apartmentIdsSchema }).strict()
])

export const inventoryThresholdSchema = z.object({
  consumableId: z.uuid(),
  minimumQuantity: z.coerce.number().int('Порог должен быть целым числом').nonnegative('Порог не может быть отрицательным'),
  targetQuantity: z.coerce.number().int('Целевой остаток должен быть целым числом').nonnegative('Целевой остаток не может быть отрицательным')
}).superRefine((value, context) => {
  if (value.minimumQuantity > 0 && value.targetQuantity <= value.minimumQuantity) {
    context.addIssue({ code: 'custom', path: ['targetQuantity'], message: 'Целевой остаток должен быть больше порога пополнения' })
  }
})

export type ReportQuery = z.infer<typeof reportQuerySchema>

export interface ProcurementApartmentRow {
  apartmentId: string
  apartmentName: string
  hotelName: string
  currentQuantity: number
  minimumQuantity: number
  targetQuantity: number
  toPurchase: number
}

export interface ProcurementRow {
  consumableId: string
  name: string
  category: string
  unit: string
  currentQuantity: number
  toPurchase: number
  apartmentCount: number
  apartments: ProcurementApartmentRow[]
}

export interface WorkloadCleaningRow {
  id: string
  apartmentName: string
  hotelName: string
  status: string
  cleaners: string[]
}

export interface WorkloadTaskRow {
  id: string
  apartmentName: string
  hotelName: string
  title: string
  status: string
  assigneeName: string | null
}

export interface WorkloadDay {
  date: string
  arrivals: number
  departures: number
  cleaningCounts: Record<string, number>
  cleanings: WorkloadCleaningRow[]
  tasks: WorkloadTaskRow[]
}

export interface ReportBreakdownRow {
  id: string
  label: string
  amountEur: number
}

export interface ReportFinanceEntry {
  id: string
  apartmentId: string
  apartmentName: string
  hotelName: string
  managerName: string
  type: string
  amountEur: number
  occurredOn: string
  description: string
  sourceType: string
  sourceId: string
}

export interface GlobalReportResponse {
  generatedAt: string
  filters: ReportQuery & {
    hotelName: string | null
    apartments: Array<{
      id: string
      name: string
      hotelName: string
      status: string
    }>
  }
  summary: {
    scheduledCleanings: number
    procurementPositions: number
    problems: number
    operatingExpensesEur: number
  }
  procurement: ProcurementRow[]
  workload: {
    days: WorkloadDay[]
    unscheduledCleanings: WorkloadCleaningRow[]
    overdueTasks: WorkloadTaskRow[]
    undatedTasks: WorkloadTaskRow[]
  }
  finance: {
    operatingExpensesEur: number
    guestServicesEur: number
    cleaningComponents: {
      cleanerPoolEur: number
      laundryEur: number
      serviceEur: number
      ownerTotalEur: number
    }
    byType: ReportBreakdownRow[]
    byHotel: ReportBreakdownRow[]
    byApartment: ReportBreakdownRow[]
    byManager: ReportBreakdownRow[]
    entries: ReportFinanceEntry[]
  }
}
