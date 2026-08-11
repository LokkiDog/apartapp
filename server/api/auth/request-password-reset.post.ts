import { z } from 'zod'
import { requestPasswordReset } from '../../modules/auth/account.service'
const schema = z.object({ email: z.string().email() })
export default defineEventHandler(async event => { await requestPasswordReset(schema.parse(await readBody(event)).email); return { ok: true } })
