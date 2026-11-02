import { createError, setResponseHeader, type H3Event } from 'h3'
import type { Actor } from '../auth/actor'

const attempts = new Map<string, { count: number; expires: number }>()
export function checkTranslationRateLimit(event: H3Event, actor: Actor) {
  const now = Date.now()
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key)
  const key = `${actor.organizationId}:${actor.id}`
  const limit = attempts.get(key) ?? { count: 0, expires: now + 60_000 }
  if (limit.count >= 10) {
    setResponseHeader(event, 'Retry-After', Math.ceil((limit.expires - now) / 1000))
    throw createError({ statusCode: 429, data: { code: 'TRANSLATION_RATE_LIMIT' }, message: 'Too many translation requests' })
  }
  limit.count++
  attempts.set(key, limit)
}
