import { z } from 'zod'
import { messagingSetupEvents } from './messaging'

export const systemNotificationEvents = {
  clientRegistered: 'system.client_registered',
  invitationFailed: 'system.invitation_failed'
} as const

export const systemEmailCategories = ['setup', 'registration', 'invitationFailure'] as const
export type SystemEmailCategory = typeof systemEmailCategories[number]
export type SystemEmailPreferences = Record<SystemEmailCategory, boolean>
export const systemEmailDefaults: SystemEmailPreferences = { setup: true, registration: false, invitationFailure: false }

const setupEvents = Object.values(messagingSetupEvents)
export const systemNotificationKeys = [...setupEvents, ...Object.values(systemNotificationEvents)]

export function systemEmailCategory(event: string | null): SystemEmailCategory | undefined {
  if (event && setupEvents.includes(event)) return 'setup'
  if (event === systemNotificationEvents.clientRegistered) return 'registration'
  if (event === systemNotificationEvents.invitationFailed) return 'invitationFailure'
}

export const systemEmailUpdateSchema = z.object({
  category: z.enum(systemEmailCategories),
  enabled: z.boolean()
}).strict()

export interface MessagingSetupRequest {
  id: string
  organizationId: string | null
  title: string
  body: string
}

export interface SystemNotification {
  id: string
  organizationId: string | null
  company: string | null
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

export interface SystemNotificationFeed {
  items: SystemNotification[]
  nextCursor: string | null
}
