import { requireActor } from '../../infrastructure/auth/actor'
import { AgentAccessError, requireAgentSettingsAccess } from '../../modules/ai-agents/access'
import { revokeConnection } from '../../modules/ai-agents/grants'
import { z } from 'zod'
import { aiAgentProviders } from '@contracts/ai-agents'
import { agentClients, requireCrmOrigin } from '../../modules/ai-agents/oauth-config'

export default defineEventHandler(async event => {
  requireCrmOrigin(event)
  const actor = await requireActor(event)
  requireAgentSettingsAccess(actor)
  const provider = z.enum(aiAgentProviders).default('chatgpt').safeParse(getQuery(event).provider)
  if (!provider.success) throw createError({ statusCode: 400, statusMessage: 'Unknown AI agent' })
  try {
    await revokeConnection(actor, agentClients[provider.data])
  } catch (cause) {
    if (!(cause instanceof AgentAccessError)) throw cause
    throw createError({ statusCode: 403, statusMessage: 'AI agent access is unavailable' })
  }
  return sendNoContent(event)
})
