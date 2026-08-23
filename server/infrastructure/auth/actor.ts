import { and, eq } from 'drizzle-orm'
import { db } from '../database/client'
import { apartmentManagers, users } from '../database/schema'
import type { UserRole } from '@contracts/crm'

export interface Actor {
  id: string
  organizationId: string
  email: string
  name: string
  roles: UserRole[]
}

export async function requireActor(event: Parameters<typeof requireUserSession>[0]): Promise<Actor> {
  const session = await requireUserSession(event)
  const userId = (session.user as { id?: string } | undefined)?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Требуется вход' })

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 401, statusMessage: 'Сессия недействительна' })
  }

  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    roles: user.roles
  }
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
  return isAdministrator(actor) || actor.roles.includes('cleaner')
}

export function requireWorkSectionAccess(actor: Actor) {
  if (!canAccessWorkSection(actor)) {
    throw createError({ statusCode: 403, statusMessage: 'Недостаточно прав' })
  }
}

export function canAccessAssignedWork(actor: Actor, assigneeId: string | null) {
  return isAdministrator(actor) || (actor.roles.includes('cleaner') && assigneeId === actor.id)
}

export async function canManageApartment(actor: Actor, apartmentId: string) {
  if (isAdministrator(actor)) return true
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
