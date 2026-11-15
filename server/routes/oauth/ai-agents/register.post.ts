import { geminiRegistrationSchema, registerGeminiClient } from '../../../modules/ai-agents/gemini-client'
import { readLimitedBody } from '../../../modules/ai-agents/request-body'

export default defineEventHandler(async event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) {
    setResponseStatus(event, 415)
    return { error: 'invalid_client_metadata' }
  }
  const body = await readLimitedBody(event, 8192)
  let input: unknown
  try { input = JSON.parse(body) } catch { input = null }
  const parsed = geminiRegistrationSchema.safeParse(input)
  if (!parsed.success) {
    setResponseStatus(event, 400)
    return { error: 'invalid_client_metadata' }
  }
  setResponseStatus(event, 201)
  return registerGeminiClient(event, parsed.data)
})
