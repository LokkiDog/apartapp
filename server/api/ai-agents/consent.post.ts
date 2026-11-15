import { readLimitedBody } from '../../modules/ai-agents/request-body'
import { z } from 'zod'
import { aiAgentPermissions } from '@contracts/ai-agents'
import { requirePrincipal } from '../../infrastructure/auth/platform'
import { AgentAccessError, requireAgentSettingsAccess } from '../../modules/ai-agents/access'
import { grantCode } from '../../modules/ai-agents/grants'
import { authorizationSchema, oauthUrls, requireAuthorizationClient, requireCrmOrigin } from '../../modules/ai-agents/oauth-config'

const consentSchema = z.object({
  request: authorizationSchema,
  decision: z.enum(['allow', 'deny']),
  userId: z.uuid(),
  organizationId: z.uuid(),
  permissions: z.array(z.enum(aiAgentPermissions)).max(aiAgentPermissions.length)
}).strict()

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  requireCrmOrigin(event)
  const input = consentSchema.safeParse(await readLimitedBody(event, 8192).then(body => {
    try { return JSON.parse(body) } catch { return null }
  }))
  const { resource, issuer } = oauthUrls(event)
  if (!input.success || (input.data.request.resource !== undefined && input.data.request.resource !== resource)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid authorization request' })
  }
  const { request, decision, userId, organizationId, permissions } = input.data
  const actor = await requirePrincipal(event, false)
  if (actor.id !== userId || actor.organizationId !== organizationId) {
    throw createError({ statusCode: 409, statusMessage: 'The signed-in account changed' })
  }
  await requireAuthorizationClient(event, request, decision === 'allow')
  const redirect = new URL(request.redirect_uri)
  redirect.searchParams.set('state', request.state)
  redirect.searchParams.set('iss', issuer)
  if (decision === 'deny') {
    redirect.searchParams.set('error', 'access_denied')
  } else {
    requireAgentSettingsAccess(actor)
    try {
      redirect.searchParams.set('code', await grantCode(actor, { ...request, resource }, permissions))
    } catch (cause) {
      if (!(cause instanceof AgentAccessError)) throw cause
      redirect.searchParams.set('error', cause.reason === 'paused' ? 'temporarily_unavailable' : 'access_denied')
    }
  }
  return { redirect: redirect.toString() }
})
