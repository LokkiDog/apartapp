import { telegramConnectionSchema } from '../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../modules/messaging/access'
import { connectTelegram } from '../../modules/messaging/connection'
export default defineEventHandler(async (event) =>
  connectTelegram(
    await requireMessagingActor(event),
    telegramConnectionSchema.parse(await readBody(event)).token,
  ),
)
