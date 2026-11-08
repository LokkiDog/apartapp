import { isIP } from 'node:net'
import { createError, getHeader, getRequestIP, setResponseHeader, type H3Event } from 'h3'

export interface BookingProtectionSettings {
  brandId: string
  secretKey: string
  allowedOrigins: string
  minimumScore: number | string
}

const attempts = new Map<string, { count: number; expires: number }>()

export function allowBookingOrigin(event: H3Event, settings: BookingProtectionSettings) {
  if (settings.brandId !== 'magicmop') throw createError({ statusCode: 404, message: 'Not found' })
  const origin = getHeader(event, 'origin') || ''
  const allowed = settings.allowedOrigins.split(',').map(value => value.trim()).filter(Boolean)
  let url: URL
  try { url = new URL(origin) } catch { throw createError({ statusCode: 403, message: 'Invalid origin' }) }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (origin !== url.origin || !allowed.includes(origin) || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw createError({ statusCode: 403, message: 'Invalid origin' })
  }
  setResponseHeader(event, 'Access-Control-Allow-Origin', origin)
  setResponseHeader(event, 'Vary', 'Origin')
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'POST, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return url.hostname
}

export function checkBookingRateLimit(event: H3Event) {
  const now = Date.now()
  for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key)
  // Production app binds to loopback; host Nginx overwrites X-Real-IP.
  const realIp = getHeader(event, 'x-real-ip')
  const key = realIp && isIP(realIp) ? realIp : getRequestIP(event) || 'unknown'
  const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 }
  if (entry.count >= 10 || (!attempts.has(key) && attempts.size >= 10000)) {
    setResponseHeader(event, 'Retry-After', Math.max(1, Math.ceil((entry.expires - now) / 1000)))
    throw createError({ statusCode: 429, message: 'Too many booking verification requests' })
  }
  entry.count++
  attempts.set(key, entry)
}

export async function verifyBookingToken(token: string, hostname: string, settings: BookingProtectionSettings) {
  const minimumScore = Number(settings.minimumScore)
  if (!settings.secretKey || !Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 1) {
    throw createError({ statusCode: 503, message: 'Booking protection is not configured' })
  }
  let result: { success?: unknown; action?: unknown; hostname?: unknown; score?: unknown; challenge_ts?: unknown }
  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: settings.secretKey, response: token }),
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error('Provider unavailable')
    result = await response.json()
    if (!result || typeof result !== 'object') throw new Error('Invalid provider response')
  } catch {
    // Never expose provider payloads, tokens or credentials.
    throw createError({ statusCode: 503, message: 'Booking protection is unavailable' })
  }
  const issuedAt = typeof result.challenge_ts === 'string' ? Date.parse(result.challenge_ts) : NaN
  const age = Date.now() - issuedAt
  if (result.success !== true || result.action !== 'demo_booking' || result.hostname !== hostname ||
      typeof result.score !== 'number' || !Number.isFinite(result.score) || result.score < minimumScore || result.score > 1 ||
      !Number.isFinite(issuedAt) || age < -30000 || age > 120000) {
    throw createError({ statusCode: 403, message: 'Booking verification failed' })
  }
  return { success: true }
}
