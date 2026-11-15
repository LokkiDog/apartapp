import { getHeader, type H3Event } from 'h3'
import { z } from 'zod'
import type { AiAgentProvider } from '@contracts/ai-agents'
import { geminiClientIdSchema, geminiClientPrefix, readGeminiClient } from './gemini-client'

export const chatgptClientId = 'https://chatgpt.com/oauth/client.json'
export const chatgptCallback = 'https://chatgpt.com/connector_platform_oauth_redirect'
export const claudeClientId = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
export const claudeCallback = 'https://claude.ai/api/mcp/auth_callback'
export const agentClients = { chatgpt: chatgptClientId, claude: claudeClientId, gemini: geminiClientPrefix } as const satisfies Record<AiAgentProvider, string>
const publishedClientIds = z.enum([chatgptClientId, claudeClientId])
const clientIds = z.union([publishedClientIds, geminiClientIdSchema])
type ClientId = z.infer<typeof publishedClientIds>
const callbacks = { [chatgptClientId]: chatgptCallback, [claudeClientId]: claudeCallback } as const

export function providerForClient(clientId: string): AiAgentProvider {
  if (clientId.startsWith(geminiClientPrefix)) return 'gemini'
  return clientId === claudeClientId ? 'claude' : 'chatgpt'
}
export const agentScope = 'crm:read'
export const authorizePath = '/oauth/ai-agents/authorize'
export const metadataPath = '/.well-known/oauth-protected-resource/mcp'
export const issuerMetadataPath = '/.well-known/oauth-authorization-server'
const tokenPath = '/oauth/ai-agents/token'
const registerPath = '/oauth/ai-agents/register'

export function oauthUrls(event: H3Event) {
  const { origin: issuer } = new URL(useRuntimeConfig(event).public.appUrl)
  return {
    issuer,
    resource: issuer + '/mcp',
    authorization: issuer + authorizePath,
    token: issuer + tokenPath,
    registration: issuer + registerPath,
    metadata: issuer + metadataPath
  }
}

const pkceSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const resourceSchema = z.string().max(500)
const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

function validClientRequest(request: { client_id: string; redirect_uri: string; resource?: string }) {
  if (request.client_id === chatgptClientId) return request.redirect_uri === chatgptCallback && request.resource !== undefined
  if (request.client_id === claudeClientId) return request.redirect_uri === claudeCallback
  return geminiClientIdSchema.safeParse(request.client_id).success
}

export const authorizationSchema = z.object({
  client_id: clientIds,
  redirect_uri: z.string().max(256),
  resource: resourceSchema.optional(),
  response_type: z.literal('code'),
  code_challenge: pkceSchema,
  code_challenge_method: z.literal('S256'),
  state: z.string().min(1).max(1024),
  scope: z.literal(agentScope).optional(),
  ui_locales: z.string().min(1).max(256).optional()
}).strict().refine(validClientRequest)

export const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    client_id: clientIds,
    redirect_uri: z.string().max(256),
    resource: resourceSchema.optional(),
    code: secretSchema,
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/)
  }).strict(),
  z.object({
    grant_type: z.literal('refresh_token'),
    client_id: clientIds,
    refresh_token: secretSchema,
    resource: resourceSchema.optional(),
    scope: z.literal(agentScope).optional()
  }).strict()
]).refine(request => request.grant_type === 'refresh_token' || validClientRequest(request))

export function requireCrmOrigin(event: H3Event) {
  if (getHeader(event, 'origin') !== oauthUrls(event).issuer) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is not allowed' })
  }
}

const clientMetadataSchema = z.object({
  client_id: publishedClientIds,
  redirect_uris: z.array(z.url()),
  grant_types: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional()
})
const METADATA_TTL_MS = 60 * 60 * 1000
const verifiedUntil = new Map<ClientId, number>()
const verifications = new Map<ClientId, Promise<void>>()

async function verifyClientMetadata(clientId: ClientId) {
  // The URL and callback are pinned. Never fetch a client-supplied URL.
  const response = await fetch(clientId, { redirect: 'error', signal: AbortSignal.timeout(4000) })
  if (!response.ok) throw new Error('Could not load OAuth client metadata')
  const metadata = clientMetadataSchema.parse(await response.json())
  const publicClient = metadata.token_endpoint_auth_methods_supported?.includes('none') ?? metadata.token_endpoint_auth_method === 'none'
  if (metadata.client_id !== clientId || !metadata.redirect_uris.includes(callbacks[clientId])
    || !metadata.grant_types.includes('authorization_code')
    || !metadata.grant_types.includes('refresh_token')
    || !publicClient) {
    throw new Error('Unsupported OAuth client metadata')
  }
  verifiedUntil.set(clientId, Date.now() + METADATA_TTL_MS)
}

export async function requireAuthorizationClient(event: H3Event, request: z.infer<typeof authorizationSchema>, verifyMetadata = true) {
  const clientId = request.client_id
  if (clientId !== chatgptClientId && clientId !== claudeClientId) {
    if (!readGeminiClient(event, clientId)?.redirects.includes(request.redirect_uri)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid authorization client or redirect' })
    }
    return
  }
  if (!verifyMetadata) return
  if ((verifiedUntil.get(clientId) ?? 0) > Date.now()) return
  let verification = verifications.get(clientId)
  if (!verification) {
    verification = verifyClientMetadata(clientId).finally(() => { verifications.delete(clientId) })
    verifications.set(clientId, verification)
  }
  try {
    await verification
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'OAuth client metadata is unavailable' })
  }
}
