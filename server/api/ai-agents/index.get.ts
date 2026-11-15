import { requireActor } from '../../infrastructure/auth/actor'
import { requireAgentSettingsAccess } from '../../modules/ai-agents/access'
import { currentConnection } from '../../modules/ai-agents/grants'
import { agentClients, oauthUrls } from '../../modules/ai-agents/oauth-config'
import type { AiAgentSettings } from '@contracts/ai-agents'

export default defineEventHandler(async (event): Promise<AiAgentSettings> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const actor = await requireActor(event)
  requireAgentSettingsAccess(actor)
  const serverUrl = oauthUrls(event).resource
  const [chatgpt, claude, gemini] = await Promise.all([
    currentConnection(actor, serverUrl, agentClients.chatgpt),
    currentConnection(actor, serverUrl, agentClients.claude),
    currentConnection(actor, serverUrl, agentClients.gemini)
  ])
  return { serverUrl, connections: { chatgpt, claude, gemini } }
})
