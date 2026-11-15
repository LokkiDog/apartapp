import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, gt, inArray, like, lte, or } from 'drizzle-orm'
import type { z } from 'zod'
import type { Actor } from '../../infrastructure/auth/actor'
import { db } from '../../infrastructure/database/client'
import { aiAgentCodes, aiAgentConnections, auditLogs } from '../../infrastructure/database/schema'
import { allowedPermissions, AgentAccessError, grantedPermissions, knownPermissions, loadAgentActor } from './access'
import { agentClients, agentScope, chatgptClientId, type authorizationSchema, type tokenRequestSchema } from './oauth-config'
import { geminiClientPrefix } from './gemini-client'

const ACCESS_SECONDS = 900
const REFRESH_SECONDS = 30 * 24 * 60 * 60
const CODE_SECONDS = 120
const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000)
const hash = (value: string) => createHash('sha256').update(value).digest('base64url')
const secret = () => randomBytes(32).toString('base64url')

function clientMatch(column: typeof aiAgentCodes.clientId | typeof aiAgentConnections.clientId, clientId: string) {
  return clientId === geminiClientPrefix ? like(column, geminiClientPrefix + '%') : eq(column, clientId)
}
const owner = (actor: Actor, clientId: string) => and(eq(aiAgentConnections.organizationId, actor.organizationId),
  eq(aiAgentConnections.userId, actor.id), clientMatch(aiAgentConnections.clientId, clientId))
const ownCode = (actor: Actor, clientId: string) => and(eq(aiAgentCodes.organizationId, actor.organizationId),
  eq(aiAgentCodes.userId, actor.id), clientMatch(aiAgentCodes.clientId, clientId))

function audit(actor: Actor, id: string, action: string) {
  return { actorId: actor.id, organizationId: actor.organizationId, entityType: 'ai_agent_connection', entityId: id, action }
}

export async function currentConnection(actor: Actor, resource: string, clientId: string = chatgptClientId) {
  const [connection] = await db.select({ connectedAt: aiAgentConnections.createdAt, permissions: aiAgentConnections.permissions })
    .from(aiAgentConnections).where(and(owner(actor, clientId), eq(aiAgentConnections.resource, resource), gt(aiAgentConnections.refreshExpiresAt, new Date())))
    .orderBy(desc(aiAgentConnections.createdAt)).limit(1)
  return connection ? { connectedAt: connection.connectedAt.toISOString(), permissions: knownPermissions(connection.permissions) } : null
}

export async function revokeConnection(actor: Actor, clientId: string = chatgptClientId) {
  await db.transaction(async tx => {
    await loadAgentActor(actor.organizationId, actor.id, tx)
    await tx.delete(aiAgentCodes).where(ownCode(actor, clientId))
    const removed = await tx.delete(aiAgentConnections).where(owner(actor, clientId)).returning({ id: aiAgentConnections.id })
    if (removed.length) await tx.insert(auditLogs).values(removed.map(row => audit(actor, row.id, 'ai_agents.revoked')))
  })
}

export async function grantCode(sessionActor: Actor, request: z.infer<typeof authorizationSchema> & { resource: string }, confirmed: string[]) {
  const code = secret()
  await db.transaction(async tx => {
    const actor = await loadAgentActor(sessionActor.organizationId, sessionActor.id, tx)
    const permissions = grantedPermissions(confirmed, actor)
    if (!permissions.length) throw new AgentAccessError('invalid')
    const clientGroup = request.client_id.startsWith(geminiClientPrefix) ? geminiClientPrefix : request.client_id
    await tx.delete(aiAgentCodes).where(and(ownCode(actor, clientGroup), lte(aiAgentCodes.expiresAt, new Date())))
    await tx.insert(aiAgentCodes).values({
      hash: hash(code), organizationId: actor.organizationId, userId: actor.id, clientId: request.client_id,
      challenge: request.code_challenge, redirectUri: request.redirect_uri, resource: request.resource,
      expiresAt: expiry(CODE_SECONDS), permissions
    })
  })
  return code
}

export async function exchangeToken(request: z.infer<typeof tokenRequestSchema>, resource: string) {
  const accessToken = secret()
  const refreshToken = secret()
  const credentials = {
    resource,
    accessHash: hash(accessToken), refreshHash: hash(refreshToken),
    accessExpiresAt: expiry(ACCESS_SECONDS), refreshExpiresAt: expiry(REFRESH_SECONDS)
  }
  await db.transaction(async tx => {
    if (request.grant_type === 'authorization_code') {
      const codeHash = hash(request.code)
      const code = await tx.query.aiAgentCodes.findFirst({ where: eq(aiAgentCodes.hash, codeHash) })
      if (!code || code.challenge !== hash(request.code_verifier) || code.redirectUri !== request.redirect_uri
        || code.clientId !== request.client_id || code.resource !== resource
        || (request.resource !== undefined && code.resource !== request.resource)) throw new AgentAccessError('invalid')

      const actor = await loadAgentActor(code.organizationId, code.userId, tx)
      const [consumed] = await tx.delete(aiAgentCodes).where(and(ownCode(actor, request.client_id), eq(aiAgentCodes.hash, codeHash),
        gt(aiAgentCodes.expiresAt, new Date()))).returning({ hash: aiAgentCodes.hash })
      const permissions = grantedPermissions(code.permissions, actor)
      if (!consumed || !permissions.length) throw new AgentAccessError('invalid')

      if (request.client_id.startsWith(geminiClientPrefix)) {
        await tx.delete(aiAgentConnections).where(owner(actor, geminiClientPrefix))
      }
      const [connection] = await tx.insert(aiAgentConnections).values({
        ...credentials, organizationId: actor.organizationId, userId: actor.id, clientId: code.clientId, permissions
      }).onConflictDoUpdate({
        target: [aiAgentConnections.organizationId, aiAgentConnections.userId, aiAgentConnections.clientId],
        set: { ...credentials, permissions, createdAt: new Date() }
      }).returning({ id: aiAgentConnections.id })
      await tx.insert(auditLogs).values(audit(actor, connection!.id, 'ai_agents.authorized'))
    } else {
      const oldHash = hash(request.refresh_token)
      const connection = await tx.query.aiAgentConnections.findFirst({
        where: eq(aiAgentConnections.refreshHash, oldHash)
      })
      if (!connection || connection.clientId !== request.client_id || connection.resource !== resource) throw new AgentAccessError('invalid')
      const actor = await loadAgentActor(connection.organizationId, connection.userId, tx)
      if (!grantedPermissions(connection.permissions, actor).length) throw new AgentAccessError('invalid')

      const [rotated] = await tx.update(aiAgentConnections).set(credentials).where(and(owner(actor, request.client_id),
        eq(aiAgentConnections.refreshHash, oldHash), gt(aiAgentConnections.refreshExpiresAt, new Date())
      )).returning({ id: aiAgentConnections.id })
      if (!rotated) throw new AgentAccessError('invalid')
    }
  })
  return { token_type: 'Bearer', scope: agentScope, access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_SECONDS }
}

export async function authenticateAgent(token: string, resource: string) {
  const accessHash = hash(token)
  const connection = await db.query.aiAgentConnections.findFirst({
    where: and(eq(aiAgentConnections.accessHash, accessHash), or(
      inArray(aiAgentConnections.clientId, [agentClients.chatgpt, agentClients.claude]),
      clientMatch(aiAgentConnections.clientId, geminiClientPrefix)
    ),
      eq(aiAgentConnections.resource, resource), gt(aiAgentConnections.accessExpiresAt, new Date())),
    columns: { id: true, organizationId: true, userId: true, permissions: true }
  })
  if (!connection) throw new AgentAccessError('invalid')
  const actor = await loadAgentActor(connection.organizationId, connection.userId)
  const permissions = grantedPermissions(connection.permissions, actor)
  if (!permissions.length) throw new AgentAccessError('invalid')
  return { id: connection.id, actor, permissions }
}

export async function auditToolCall(connection: Awaited<ReturnType<typeof authenticateAgent>>, tool: string, outcome: string) {
  await db.insert(auditLogs).values({ ...audit(connection.actor, connection.id, 'ai_agents.tool_called'), payload: { tool, outcome } })
}
