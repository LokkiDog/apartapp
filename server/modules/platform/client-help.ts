import { and, asc, eq, ne } from 'drizzle-orm'
import type { ClientHelp } from '@contracts/client-help'
import { db } from '../../infrastructure/database/client'
import { aiAgentConnections, organizations, users } from '../../infrastructure/database/schema'
import { allowedPermissions } from '../ai-agents/access'
import { chatgptClientId } from '../ai-agents/oauth-config'

export async function getClientHelp(organizationId: string, origin: string, resource: string): Promise<ClientHelp> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { status: true, guestsEnabled: true, messagingEnabled: true, aiAgentsEnabled: true }
  })
  if (!organization) throw createError({ statusCode: 404, statusMessage: 'Клиент не найден' })
  const { status: organizationStatus, aiAgentsEnabled } = organization
  const rows = await db.select({
    id: users.id, name: users.name, roles: users.roles, status: users.status,
    refreshExpiresAt: aiAgentConnections.refreshExpiresAt,
    permissions: aiAgentConnections.permissions
  }).from(users).leftJoin(aiAgentConnections, and(
    eq(aiAgentConnections.userId, users.id),
    eq(aiAgentConnections.organizationId, organizationId),
    eq(aiAgentConnections.clientId, chatgptClientId),
    eq(aiAgentConnections.resource, resource)
  )).where(and(eq(users.organizationId, organizationId), eq(users.isSuperuser, false), ne(users.status, 'archived')))
    .orderBy(asc(users.name), asc(users.id))

  const now = new Date()
  function agentState(member: typeof rows[number]): ClientHelp['members'][number]['agentState'] {
    if (organizationStatus !== 'active') return 'organization_blocked'
    if (member.status !== 'active') return 'inactive_account'
    const available = allowedPermissions(member)
    if (!available.length) return 'no_permissions'
    if (!aiAgentsEnabled) return 'paused'
    if (!member.refreshExpiresAt) return 'not_connected'
    if (member.refreshExpiresAt <= now) return 'expired'
    if (!available.some(permission => member.permissions?.includes(permission))) return 'permissions_changed'
    return 'connected'
  }

  return {
    settingsUrl: origin + '/settings/ai-agents',
    guestsEnabled: organization.status === 'active' && organization.guestsEnabled,
    messagingEnabled: organization.status === 'active' && organization.messagingEnabled,
    members: rows.flatMap(member => {
      const { id, name, roles, status } = member
      return status === 'archived' ? [] : [{ id, name, roles, status, agentState: agentState(member) }]
    })
  }
}
