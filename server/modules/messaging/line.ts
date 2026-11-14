import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { MAX_MESSAGE_FILE_BYTES, type LineMessageQuota } from '../../../shared/contracts/messaging'
import { verifyWebhookSecret } from './secrets'

export function verifyLineSignature(raw: Buffer, signature: string | undefined, secret: string) {
  return verifyWebhookSecret(signature, createHmac('sha256', secret).update(raw).digest('base64'))
}

const botSchema = z.object({
  userId: z.string().regex(/^U[0-9a-f]{32}$/i),
  basicId: z.string().startsWith('@'),
  displayName: z.string().min(1).max(255),
})

function lineFetch(token: string, path: string, init?: RequestInit, content = false) {
  return fetch(`https://${content ? 'api-data' : 'api'}.line.me/v2/bot/${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
}

export async function getLineBot(token: string) {
  const response = await lineFetch(token, 'info')
  if (!response.ok) throw new Error('LINE bot lookup failed')
  return botSchema.parse(await response.json())
}

const messageCount = z.number().int().nonnegative()
const quotaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('limited'), value: messageCount }),
])
const quotaConsumptionSchema = z.object({ totalUsage: messageCount })

export async function getLineMessageQuota(token: string): Promise<LineMessageQuota> {
  const [quota, consumption] = await Promise.all([
    lineFetch(token, 'message/quota'),
    lineFetch(token, 'message/quota/consumption'),
  ])
  if (!quota.ok || !consumption.ok) throw new Error('LINE quota lookup failed')
  const limit = quotaSchema.parse(await quota.json())
  const { totalUsage } = quotaConsumptionSchema.parse(await consumption.json())
  return { limit: limit.type === 'limited' ? limit.value : null, used: totalUsage }
}

export async function getLineProfile(token: string, id: string) {
  try {
    const response = await lineFetch(token, `profile/${encodeURIComponent(id)}`)
    if (response.ok) {
      return z.object({ displayName: z.string().min(1).max(255) })
        .parse(await response.json()).displayName
    }
  } catch {
    // A guest can send a message even when their profile is unavailable.
  }
}

export async function downloadLineFile(token: string, id: string) {
  const response = await lineFetch(token, `message/${encodeURIComponent(id)}/content`, undefined, true)
  if ([404, 410].includes(response.status)) return null
  if (response.status !== 200 || !response.body) throw new Error('LINE content unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    if (Number(response.headers.get('content-length')) > MAX_MESSAGE_FILE_BYTES) return null
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > MAX_MESSAGE_FILE_BYTES) return null
      chunks.push(next.value)
    }
    return { bytes: Buffer.concat(chunks), mimeType: response.headers.get('content-type')?.split(';')[0]?.slice(0, 200) }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export class LineDeliveryError extends Error {
  constructor(public readonly outcome: 'retry' | 'failed', public readonly retryAfter = 30) {
    super(`LINE ${outcome}`)
  }
}

export async function pushLineMessage(token: string, to: string, text: string, retryKey: string) {
  let response: Response
  try {
    response = await lineFetch(token, 'message/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-retry-key': retryKey },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    })
  } catch {
    throw new LineDeliveryError('retry')
  }
  const accepted = response.headers.get('x-line-accepted-request-id')
  if (response.ok || (response.status === 409 && accepted))
    return accepted ?? response.headers.get('x-line-request-id')
  if (response.status === 429 || response.status >= 500) {
    const delay = Number(response.headers.get('retry-after'))
    throw new LineDeliveryError('retry', delay > 0 ? delay : 30)
  }
  throw new LineDeliveryError('failed')
}
