import { z } from 'zod'
import { requireActor } from '../../infrastructure/auth/actor'
import { deleteUserPermanently } from '../../modules/auth/account.service'

const schema = z.object({ confirmationName: z.string() })
export default defineEventHandler(async event => deleteUserPermanently(await requireActor(event), getRouterParam(event, 'id')!, schema.parse(await readBody(event)).confirmationName))
