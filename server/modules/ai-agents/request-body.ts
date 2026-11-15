import { getRequestWebStream, type H3Event } from 'h3'

export async function readLimitedBody(event: H3Event, maxBytes: number) {
  if (Number(getHeader(event, 'content-length')) > maxBytes) {
    throw createError({ statusCode: 413, statusMessage: 'Request body is too large' })
  }
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return body + decoder.decode()
      size += value.byteLength
      if (size > maxBytes) throw createError({ statusCode: 413, statusMessage: 'Request body is too large' })
      body += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

export function parseUniqueForm(body: string): Record<string, string> | null {
  const fields = new URLSearchParams(body)
  const result = Object.fromEntries(fields)
  return Object.keys(result).length === fields.size ? result : null
}
