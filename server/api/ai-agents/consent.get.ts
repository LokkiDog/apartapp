import { requirePrincipal } from '../../infrastructure/auth/platform'
import { allowedPermissions, requireAgentSettingsAccess } from '../../modules/ai-agents/access'
import { authorizationSchema, oauthUrls, providerForClient, requireAuthorizationClient } from '../../modules/ai-agents/oauth-config'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const request = authorizationSchema.safeParse(getQuery(event))
  if (!request.success || (request.data.resource !== undefined && request.data.resource !== oauthUrls(event).resource)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid authorization request' })
  }
  const actor = await requirePrincipal(event, false)
  requireAgentSettingsAccess(actor)
  await requireAuthorizationClient(event, request.data)
  return { userId: actor.id, organizationId: actor.organizationId, organizationName: actor.organizationName,
    permissions: allowedPermissions(actor), provider: providerForClient(request.data.client_id), callbackHost: new URL(request.data.redirect_uri).hostname }
})
