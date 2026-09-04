import { z } from 'zod'
import { getRouterParam } from 'h3'
import { requireActor } from '../../../infrastructure/auth/actor'
import { setVikaUser } from '../../../modules/auth/account.service'

const schema = z.object({ isVika: z.boolean() })

export default defineEventHandler(async event => setVikaUser(
  await requireActor(event),
  getRouterParam(event, 'id')!,
  schema.parse(await readBody(event)).isVika
))
