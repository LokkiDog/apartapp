import { and, eq } from 'drizzle-orm'
import { db } from '../database/client'
import { apartmentManagers, apartments, users } from '../database/schema'
import type { UserRole } from '@contracts/crm'
import { requirePrincipal, sessionExpiry } from './platform'
import { refreshUserSession } from './session'
import { platformSessions } from '../database/schema'
import { getHeader, getQuery, getMethod } from 'h3'

export interface Actor {
  id: string
  organizationId: string
  email: string
  name: string
  roles: UserRole[]
  locale: 'ru' | 'en' | 'he'
  isSuperuser?: boolean
  inSystem?: boolean
  organizationName?: string
  organizationStatus?: 'active' | 'blocked'
  platformSessionId?: string
  contextRevision?: string
  sessionVersion?: number
}

export async function requireActor(event: Parameters<typeof setUserSession>[0]): Promise<Actor> {
  const actor = await requirePrincipal(event, false)
  if (actor.inSystem) throw createError({ statusCode: 409, statusMessage: 'Выберите клиента' })
  if (actor.isSuperuser && (getHeader(event, 'x-client-context') ?? (getMethod(event) === 'GET' ? getQuery(event).clientContext : undefined)) !== `${actor.organizationId}:${actor.contextRevision}`) {
    throw createError({ statusCode: 409, statusMessage: 'Контекст клиента изменился', data: { code: 'CLIENT_CONTEXT_CHANGED' } })
  }
  // Do not renew a stale-context request or overwrite a newly selected context.
  await db.update(platformSessions).set({ expiresAt: sessionExpiry() }).where(eq(platformSessions.id, actor.platformSessionId!))
  await refreshUserSession(event, actor)
  event.context.platformActor = actor
  return actor
}

export function requireRole(actor: Actor, ...roles: UserRole[]) {
  if (!roles.some(role => actor.roles.includes(role))) {
    throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  }
}

export function isAdministrator(actor: Actor) {
  return actor.roles.includes('administrator')
}

export function canAccessWorkSection(actor: Actor) {
  return isAdministrator(actor) || actor.roles.includes('cleaner') || actor.roles.includes('specialist')
}

export function requireWorkSectionAccess(actor: Actor) {
  if (!canAccessWorkSection(actor)) {
    throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  }
}

export function canAccessAssignedWork(actor: Actor, assigneeId: string | null) {
  return isAdministrator(actor) || ((actor.roles.includes('cleaner') || actor.roles.includes('specialist')) && assigneeId === actor.id)
}

export async function canManageApartment(actor: Actor, apartmentId: string) {
  const apartment = await db.query.apartments.findFirst({ where: and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId)), columns: { id: true } })
  if (!apartment) return false
  if (isAdministrator(actor)) return true
  return isAssignedToApartment(actor, apartmentId)
}

export async function isAssignedToApartment(actor: Actor, apartmentId: string) {
  const assignment = await db.query.apartmentManagers.findFirst({
    where: and(
      eq(apartmentManagers.apartmentId, apartmentId),
      eq(apartmentManagers.organizationId, actor.organizationId),
      eq(apartmentManagers.userId, actor.id)
    )
  })
  return Boolean(assignment)
}

export async function managedApartmentIds(actor: Actor) {
  if (isAdministrator(actor)) return null
  const rows = await db.select({ apartmentId: apartmentManagers.apartmentId }).from(apartmentManagers)
    .where(and(eq(apartmentManagers.organizationId, actor.organizationId), eq(apartmentManagers.userId, actor.id)))
  return rows.map(row => row.apartmentId)
}
