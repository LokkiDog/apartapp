import { parseUniqueForm, readLimitedBody } from '../../../modules/ai-agents/request-body'
import { AgentAccessError } from '../../../modules/ai-agents/access'
import { exchangeToken } from '../../../modules/ai-agents/grants'
import { geminiClientPrefix, readGeminiClient, verifyGeminiSecret } from '../../../modules/ai-agents/gemini-client'
import { oauthUrls, tokenRequestSchema } from '../../../modules/ai-agents/oauth-config'

function basicCredentials(header: string) {
  const encoded = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header)?.[1]
  if (!encoded || encoded.length > 4096) return null
  const fields = Buffer.from(encoded, 'base64').toString('utf8').split(':')
  if (fields.length !== 2 || !fields[0] || !fields[1]) return null
  return { id: fields[0], secret: fields[1] }
}

export default defineEventHandler(async event => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store', Pragma: 'no-cache' })
  if (!getHeader(event, 'content-type')?.startsWith('application/x-www-form-urlencoded')) {
    setResponseStatus(event, 400)
    return { error: 'invalid_request' }
  }
  const { resource } = oauthUrls(event)
  const body = parseUniqueForm(await readLimitedBody(event, 8192))
  const invalidClient = () => {
    setResponseStatus(event, 401)
    return { error: 'invalid_client' }
  }
  const authorization = getHeader(event, 'authorization')
  const basic = authorization ? basicCredentials(authorization) : null
  if (authorization && (!basic || body?.client_id !== undefined || body?.client_secret !== undefined)) return invalidClient()
  const { client_secret: clientSecret, ...params } = body ?? {}
  const parsed = tokenRequestSchema.safeParse(body && (basic ? { ...params, client_id: basic.id } : params))
  if (!parsed.success || (parsed.data.resource !== undefined && parsed.data.resource !== resource)) {
    setResponseStatus(event, 400)
    return { error: 'invalid_request' }
  }
  const clientId = parsed.data.client_id
  if (clientId.startsWith(geminiClientPrefix)) {
    const client = readGeminiClient(event, clientId)
    const method = basic ? 'client_secret_basic' : clientSecret !== undefined ? 'client_secret_post' : 'none'
    if (client?.method !== method || (method !== 'none' && !verifyGeminiSecret(event, clientId, basic?.secret ?? clientSecret))) {
      return invalidClient()
    }
  } else if (basic || clientSecret !== undefined) {
    return invalidClient()
  }
  try {
    return await exchangeToken(parsed.data, resource)
  } catch (cause) {
    if (!(cause instanceof AgentAccessError)) throw cause
    setResponseStatus(event, cause.reason === 'paused' ? 503 : 400)
    return { error: cause.reason === 'paused' ? 'temporarily_unavailable' : 'invalid_grant' }
  }
})
