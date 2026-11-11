import { lineConnectionSchema } from '../../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../../modules/messaging/access'
import { connectLine } from '../../../modules/messaging/line-connection'

export default defineEventHandler(async (event) => {
  const actor = await requireMessagingActor(event)
  const input = lineConnectionSchema.safeParse(await readBody(event))
  if (!input.success)
    throw createError({ statusCode: 422, statusMessage: 'Проверьте токен и секрет канала LINE' })
  return connectLine(actor, input.data.token, input.data.secret)
})
