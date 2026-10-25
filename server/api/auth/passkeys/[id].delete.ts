import { z } from 'zod'
import { deletePasskey } from '../../../modules/auth/passkey.service'
export default defineEventHandler(event => deletePasskey(event, z.string().min(1).max(1024).parse(getRouterParam(event, 'id'))))
