import { z } from 'zod'
import { registerPasskey, type RegistrationResponseJSON } from '../../../modules/auth/passkey.service'
const schema = z.object({ attemptId: z.string().uuid(), name: z.string().trim().min(1).max(80), response: z.object({ id: z.string().min(1).max(1024) }).passthrough() })
export default defineEventHandler(async event => {
  const data = schema.parse(await readBody(event))
  return registerPasskey(event, data.attemptId, data.response as unknown as RegistrationResponseJSON, data.name)
})
