import { z } from 'zod'
import {
  messageInputSchema,
  MAX_MESSAGE_FILE_BYTES,
} from '../../../../../shared/contracts/messaging'
import { requireMessagingActor } from '../../../../modules/messaging/access'
import {
  enqueueMessage,
  type OutgoingFile,
} from '../../../../modules/messaging/conversations'
import {
  readMessagingBody,
  parseMessagingJson,
} from '../../../../modules/messaging/body'
export default defineEventHandler(async (event) => {
  const actor = await requireMessagingActor(event)
  const conversationId = z.uuid().parse(getRouterParam(event, 'id'))
  const raw = await readMessagingBody(event, MAX_MESSAGE_FILE_BYTES + 64 * 1024)
  let input: z.infer<typeof messageInputSchema>
  let file: OutgoingFile | undefined
  if (getHeader(event, 'content-type')?.startsWith('multipart/form-data')) {
    const form = await new Response(new Uint8Array(raw), {
      headers: { 'content-type': getHeader(event, 'content-type')! },
    }).formData()
    const files = [...form.values()].filter(
      (value): value is File => typeof value !== 'string',
    )
    if (files.length > 1)
      throw createError({
        statusCode: 422,
        statusMessage: 'Допускается один файл',
      })
    const upload = files[0]
    if (upload)
      file = {
        data: Buffer.from(await upload.arrayBuffer()),
        name: upload.name || 'attachment',
        mimeType: upload.type || 'application/octet-stream',
      }
    input = messageInputSchema.parse({
      requestId: form.get('requestId'),
      text: form.get('text') ?? '',
    })
  } else input = messageInputSchema.parse(parseMessagingJson(raw))
  return enqueueMessage(actor, conversationId, input, file)
})
