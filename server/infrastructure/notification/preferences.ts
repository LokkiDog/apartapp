import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { availableNotificationEvents, effectiveNotificationChannels, notificationPreferencesUpdateSchema } from '@contracts/notification-preferences'
import type { Actor } from '../auth/actor'
import { db } from '../database/client'
import { notificationPreferences } from '../database/schema'

export async function getNotificationPreferences(actor: Actor) {
  const stored = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.organizationId, actor.organizationId), eq(notificationPreferences.userId, actor.id)))
  return availableNotificationEvents(actor.roles).map(event => ({ event: event.key, ...effectiveNotificationChannels(stored.find(row => row.eventKey === event.key)) }))
}
export async function updateNotificationPreferences(actor: Actor, input: unknown) {
  const { changes } = notificationPreferencesUpdateSchema.parse(input)
  const allowed = new Set<string>(availableNotificationEvents(actor.roles).map(event => event.key))
  if (changes.some(row => !allowed.has(row.event))) throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  await db.insert(notificationPreferences).values(changes.map(({ event, ...channels }) => ({ organizationId: actor.organizationId, userId: actor.id, eventKey: event, ...channels }))).onConflictDoUpdate({
    target: [notificationPreferences.organizationId, notificationPreferences.userId, notificationPreferences.eventKey],
    set: { crm: sql`excluded.crm`, push: sql`excluded.push`, email: sql`excluded.email` }
  })
  return getNotificationPreferences(actor)
}
