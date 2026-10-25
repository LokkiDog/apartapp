import { z } from 'zod'
import { authenticatePasskey, type AuthenticationResponseJSON } from '../../../modules/auth/passkey.service'
const schema = z.object({ attemptId: z.string().uuid(), response: z.object({ id: z.string().min(1).max(1024), response: z.object({ userHandle: z.string().max(1024).nullish() }).passthrough() }).passthrough() })
export default defineEventHandler(async event => {
  const data = schema.parse(await readBody(event))
  return authenticatePasskey(event, data.attemptId, data.response as unknown as AuthenticationResponseJSON)
})
