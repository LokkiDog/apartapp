import { z } from 'zod'
import { setPassword } from '../../modules/auth/account.service'
const schema = z.object({ token: z.string().min(20), password: z.string().min(8).max(200) })
export default defineEventHandler(async event => { const data = schema.parse(await readBody(event)); await setPassword(data.token, data.password); return { ok: true } })
