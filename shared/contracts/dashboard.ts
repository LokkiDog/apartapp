import { z } from 'zod'

export const dashboardQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict()

export type DashboardStay = {
  id: string
  checkInOn: string
  checkOutOn: string
  adultCount: number
  childCount: number
  apartment: { name: string; hotel: { name: string } }
}

export type DashboardCleaning = {
  id: string
  status: string
  scheduledOn: string
  tariffSnapshot: { cleanerPoolEur?: number }
  apartment: { name: string; hotel: { name: string } }
}

export type DashboardTask = {
  id: string
  status: string
  dueOn: string | null
  hasProblem: boolean
  problemDescription: string
  apartment: { name: string; hotel: { name: string } }
}

export type DashboardProblem = {
  id: string
  description: string
  apartment: { name: string; hotel: { name: string } }
}

export type DashboardResponse = {
  stays: { count: number; items: DashboardStay[] }
  cleanings: { count: number; items: DashboardCleaning[]; cleanerPoolEur: number }
  tasks: { activeCount: number; undatedItems: DashboardTask[] }
  problems: { openCount: number; items: DashboardProblem[] }
}
