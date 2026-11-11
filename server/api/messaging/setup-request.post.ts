import { z } from 'zod'
import { requireMessagingActor } from '../../modules/messaging/access'
import { requestMessagingSetup } from '../../modules/messaging/setup-requests'

const inputSchema = z.object({ channel: z.enum(['telegram', 'line']) }).strict()

export default defineEventHandler(async event => {
  const actor = await requireMessagingActor(event)
  const input = inputSchema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 422, statusMessage: 'Выберите канал сообщений' })
  return requestMessagingSetup(actor, input.data.channel)
})
