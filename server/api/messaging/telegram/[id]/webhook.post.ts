import { z } from 'zod'
import { receiveTelegramUpdate } from '../../../../modules/messaging/incoming'
import {
  readMessagingBody,
  parseMessagingJson,
} from '../../../../modules/messaging/body'
export default defineEventHandler(async (event) => {
  return receiveTelegramUpdate(
    z.uuid().parse(getRouterParam(event, 'id')),
    getHeader(event, 'x-telegram-bot-api-secret-token'),
    parseMessagingJson(await readMessagingBody(event, 512 * 1024)),
  )
})
