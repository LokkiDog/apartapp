import { z } from 'zod'

export const aiAgentPermissions = ['bookings', 'cleanings', 'tasks'] as const
export type AiAgentPermission = typeof aiAgentPermissions[number]
export const aiAgentProviders = ['chatgpt', 'claude', 'gemini'] as const
export type AiAgentProvider = typeof aiAgentProviders[number]
export const aiAgentNames: Record<AiAgentProvider, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' }

export const aiAgentPeriodFields = {
  from: z.iso.date().describe('Start date (YYYY-MM-DD, Europe/Sofia)'),
  to: z.iso.date().describe('End date (YYYY-MM-DD, Europe/Sofia)'),
  apartmentId: z.uuid().optional(),
  cursor: z.string().max(150).optional(),
  limit: z.number().int().min(1).max(100).default(50)
}

export const aiAgentBookingsFields = {
  ...aiAgentPeriodFields,
  mode: z.enum(['overlap', 'arrivals', 'departures']).default('overlap')
}

export const aiAgentDailyFields = {
  date: z.iso.date().optional().describe('Calendar date in Europe/Sofia; defaults to today'),
  apartmentId: z.uuid().optional(),
  cursor: z.string().max(300).optional(),
  limit: z.number().int().min(1).max(50).default(50)
}

export const aiAgentAnalyticsFields = {
  from: aiAgentPeriodFields.from,
  to: aiAgentPeriodFields.to,
  apartmentId: z.uuid().optional()
}

export interface AiAgentSettings {
  serverUrl: string
  connections: Record<AiAgentProvider, { connectedAt: string; permissions: AiAgentPermission[] } | null>
}
