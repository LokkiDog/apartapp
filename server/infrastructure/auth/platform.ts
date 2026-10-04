import { and, eq, gt } from 'drizzle-orm'
import { db } from '../database/client'
import { organizations, platformSessions, users } from '../database/schema'
import type { Actor } from './actor'
import { refreshUserSession } from './session'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from '../../../shared/config/auth-session'

export const SESSION_VERSION = 2
export const sessionExpiry = () => new Date(Date.now() + AUTH_SESSION_IDLE_MAX_AGE_SECONDS * 1000)
type Event = Parameters<typeof setUserSession>[0]

export function resolvePlatformAccess(user: { organizationId: string; isSuperuser: boolean }, selectedId: string | null, status?: string) {
  if (!user.isSuperuser && selectedId !== user.organizationId) throw createError({ statusCode: 403, statusMessage: 'Нет доступа к клиенту' })
  if (!user.isSuperuser && status !== 'active') throw createError({ statusCode: 401, statusMessage: 'Клиент заблокирован' })
  return { inSystem: user.isSuperuser && !selectedId }
}

export async function requirePrincipal(event: Event, renew = true): Promise<Actor> {
  const session = await requireUserSession(event)
  const identity = session.user as { id?: string; platformSessionId?: string; sessionVersion?: number } | undefined
  if (!identity?.id || !identity.platformSessionId || identity.sessionVersion !== SESSION_VERSION) {
    throw createError({ statusCode: 401, statusMessage: 'Требуется повторный вход' })
  }
  const user = await db.query.users.findFirst({ where: and(eq(users.id, identity.id), eq(users.status, 'active')) })
  const context = await db.query.platformSessions.findFirst({ where: and(eq(platformSessions.id, identity.platformSessionId), eq(platformSessions.userId, identity.id), gt(platformSessions.expiresAt, new Date())) })
  if (!user || !context) throw createError({ statusCode: 401, statusMessage: 'Сессия недействительна' })
  const organization = context.organizationId ? await db.query.organizations.findFirst({ where: eq(organizations.id, context.organizationId) }) : undefined
  if (context.organizationId && !organization) throw createError({ statusCode: 401, statusMessage: 'Клиент недоступен' })
  const { inSystem } = resolvePlatformAccess(user, context.organizationId, organization?.status)
  const actor: Actor = {
    id: user.id, organizationId: organization?.id ?? user.organizationId,
    email: user.email, name: user.name, locale: user.locale,
    roles: user.isSuperuser ? (inSystem ? [] : ['administrator']) : user.roles,
    isSuperuser: user.isSuperuser, inSystem, organizationName: organization?.name,
    organizationStatus: organization?.status,
    platformSessionId: context.id, contextRevision: context.revision, sessionVersion: SESSION_VERSION
  }
  if (renew) {
    await db.update(platformSessions).set({ expiresAt: sessionExpiry() }).where(eq(platformSessions.id, context.id))
    await refreshUserSession(event, actor)
  }
  return actor
}

export async function requireSuperuser(event: Event) {
  const actor = await requirePrincipal(event)
  if (!actor.isSuperuser) throw createError({ statusCode: 403, statusMessage: 'Требуется суперпользователь' })
  return actor
}

export async function isClientActive(organizationId: string) {
  const organization = await db.query.organizations.findFirst({ where: and(eq(organizations.id, organizationId), eq(organizations.status, 'active')), columns: { id: true } })
  return Boolean(organization)
}
