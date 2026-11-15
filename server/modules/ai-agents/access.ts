import { and, eq } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { organizations, users } from '../../infrastructure/database/schema'
import { canAccessWorkSection, type Actor } from '../../infrastructure/auth/actor'
import { aiAgentPermissions, type AiAgentPermission } from '@contracts/ai-agents'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function allowedPermissions(actor: Pick<Actor, 'roles' | 'isSuperuser' | 'inSystem'>): AiAgentPermission[] {
  if (actor.isSuperuser || actor.inSystem) return []
  const permissions: AiAgentPermission[] = []
  if (actor.roles.includes('administrator') || actor.roles.includes('manager')) permissions.push('bookings')
  if (canAccessWorkSection(actor)) permissions.push('cleanings', 'tasks')
  return permissions
}

export function grantedPermissions(stored: string[], actor: Actor) {
  return allowedPermissions(actor).filter(permission => stored.includes(permission))
}

export function knownPermissions(stored: string[]) {
  return aiAgentPermissions.filter(permission => stored.includes(permission))
}

export class AgentAccessError extends Error {
  constructor(readonly reason: 'paused' | 'invalid') { super(reason) }
}

export async function loadAgentActor(organizationId: string, userId: string, tx?: Transaction): Promise<Actor> {
  const database = tx ?? db
  const organizationQuery = database.select().from(organizations).where(eq(organizations.id, organizationId))
  const [organization] = await (tx ? organizationQuery.for('share') : organizationQuery)
  if (organization?.status !== 'active') throw new AgentAccessError('invalid')

  const userQuery = database.select({ id: users.id, roles: users.roles, locale: users.locale,
    email: users.email, name: users.name, isSuperuser: users.isSuperuser }).from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.status, 'active')))
  const [user] = await (tx ? userQuery.for('update') : userQuery)
  if (!user || user.isSuperuser) throw new AgentAccessError('invalid')
  const actor = { ...user, organizationId, organizationName: organization.name }
  if (!allowedPermissions(actor).length) throw new AgentAccessError('invalid')
  if (!organization.aiAgentsEnabled) throw new AgentAccessError('paused')
  return actor
}

export function requireAgentSettingsAccess(actor: Actor) {
  if (!actor.aiAgentsEnabled || !allowedPermissions(actor).length) {
    throw createError({ statusCode: 403, statusMessage: 'AI agent access is unavailable' })
  }
}
