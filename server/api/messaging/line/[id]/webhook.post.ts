import { z } from 'zod'
import { readMessagingBody } from '../../../../modules/messaging/body'
import { receiveLineWebhook } from '../../../../modules/messaging/line-incoming'

export default defineEventHandler(async (event) => receiveLineWebhook(
  z.uuid().parse(getRouterParam(event, 'id')),
  getHeader(event, 'x-line-signature'),
  await readMessagingBody(event, 512 * 1024),
))
