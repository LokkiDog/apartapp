import { createError, getHeader, getRequestWebStream, type H3Event } from 'h3'

export async function readMessagingBody(event: H3Event, limit: number) {
  if (Number(getHeader(event, 'content-length') ?? 0) > limit)
    throw createError({
      statusCode: 413,
      statusMessage: 'Файл или запрос слишком большой',
    })
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit)
        throw createError({
          statusCode: 413,
          statusMessage: 'Файл или запрос слишком большой',
        })
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}

export function parseMessagingJson(body: Buffer) {
  try {
    return JSON.parse(body.toString('utf8')) as unknown
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный JSON' })
  }
}
