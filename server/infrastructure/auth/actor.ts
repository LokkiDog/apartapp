import { and, eq } from 'drizzle-orm'
import { db } from '../database/client'
import { users } from '../database/schema'
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

export async function canManageApartment(actor: Actor, apartmentId: string) {
  if (isAdministrator(actor)) return true
  const apartment = await db.query.apartments.findFirst({
    where: (apartments, { and, eq }) => and(eq(apartments.id, apartmentId), eq(apartments.organizationId, actor.organizationId))
  })
  return apartment?.managerId === actor.id
}
