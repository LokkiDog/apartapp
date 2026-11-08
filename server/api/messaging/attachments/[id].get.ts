import { z } from 'zod'
import { requireMessagingActor } from '../../../modules/messaging/access'
import { getMessageAttachment } from '../../../modules/messaging/conversations'
export default defineEventHandler(async (event) => {
  const actor = await requireMessagingActor(event)
  const file = await getMessageAttachment(
    actor,
    z.uuid().parse(getRouterParam(event, 'id')),
  )
  setHeader(event, 'content-type', 'application/octet-stream')
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(
    event,
    'content-disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
  )
  return send(event, file.content)
})
