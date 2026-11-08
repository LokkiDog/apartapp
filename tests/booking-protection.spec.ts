import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import post from '../server/api/public/booking/verify.post'
import options from '../server/api/public/booking/verify.options'
import security from '../server/middleware/platform-security'

const origin = 'https://magicmopcrm.com'
const path = '/api/public/booking/verify'
const config = {
  public: { brand: { id: 'magicmop' } },
  recaptchaSecretKey: 'server-only-secret',
  recaptchaAllowedOrigins: origin + ',https://www.magicmopcrm.com',
  recaptchaMinimumScore: '0.5'
}
const provider = vi.fn()
let ip = 0
const app = createApp()
app.use(security)
app.use(createRouter()
  .post(path, post)
  .options(path, options)
  .post('/api/auth/login', defineEventHandler(() => ({ protected: true }))))
const handle = toWebHandler(app)
const validResult = () => ({
  success: true, action: 'demo_booking', hostname: 'magicmopcrm.com',
  score: 0.5, challenge_ts: new Date().toISOString()
})
function request(body: unknown = { token: 'google-token' }, init: RequestInit = {}, requestPath = path) {
  return handle(new Request('https://app.magicmopcrm.com' + requestPath, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Real-IP': '198.51.100.' + (++ip), ...init.headers }
  }))
}

beforeEach(() => {
  config.public.brand.id = 'magicmop'
  config.recaptchaSecretKey = 'server-only-secret'
  config.recaptchaMinimumScore = '0.5'
  provider.mockReset().mockImplementation(async () => Response.json(validResult()))
  vi.stubGlobal('fetch', provider)
  vi.stubGlobal('useRuntimeConfig', () => config)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('public MagicMop booking protection HTTP contract', () => {
  it('verifies the token without a CRM session and returns only the public result', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
    const [url, init] = provider.mock.calls[0]!
    expect(url).toBe('https://www.google.com/recaptcha/api/siteverify')
    expect(Object.fromEntries(init.body)).toEqual({ secret: 'server-only-secret', response: 'google-token' })
  })

  it('allows only the token endpoint preflight and preserves cross-origin protection for CRM mutations', async () => {
    const preflight = await request(undefined, {
      method: 'OPTIONS', body: undefined,
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
    const forbidden = await request(undefined, {
      method: 'OPTIONS', body: undefined,
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' }
    })
    expect(forbidden.status).toBe(403)
    const protectedResponse = await request({}, { headers: { 'Sec-Fetch-Site': 'cross-site' } }, '/api/auth/login')
    expect(protectedResponse.status).toBe(403)
    expect(protectedResponse.headers.get('access-control-allow-origin')).toBeNull()
    expect(provider).not.toHaveBeenCalled()
  })

  it.each(['https://attacker.example', 'https://magicmopcrm.com.attacker.example', 'http://magicmopcrm.com', 'null', ''])('rejects unapproved origin %s', async value => {
    const response = await request(undefined, { headers: { Origin: value } })
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(provider).not.toHaveBeenCalled()
  })

  it('does not enable the endpoint on Aparts', async () => {
    config.public.brand.id = 'aparts'
    const response = await request()
    expect(response.status).toBe(404)
    expect(provider).not.toHaveBeenCalled()
  })

  it.each([{}, null, { token: '' }, { token: ' '.repeat(10) }, { token: 'x'.repeat(8001) }, { token: 'ok', secret: 'client-secret' }])('rejects an invalid request body %#', async body => {
    const response = await request(body)
    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it('rejects non-JSON requests before contacting Google', async () => {
    expect((await request({}, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    expect(provider).not.toHaveBeenCalled()
  })

  it.each([
    { success: false }, { action: 'login' }, { hostname: 'attacker.example' },
    { score: 0.49 }, { score: '0.9' }, { score: null }, { score: 1.1 },
    { challenge_ts: 'invalid' }, { challenge_ts: '2000-01-01T00:00:00Z' },
    { challenge_ts: '2100-01-01T00:00:00Z' }
  ])('rejects invalid Google result %#', async override => {
    provider.mockResolvedValue(Response.json({ ...validResult(), ...override }))
    expect((await request()).status).toBe(403)
  })

  it('does not bypass missing configuration or provider outages', async () => {
    config.recaptchaSecretKey = ''
    expect((await request()).status).toBe(503)
    expect(provider).not.toHaveBeenCalled()
    config.recaptchaSecretKey = 'server-only-secret'
    provider.mockRejectedValue(new Error('do not expose google-token or server-only-secret'))
    const response = await request()
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).not.toContain('google-token')
    expect(text).not.toContain('server-only-secret')
  })

  it('limits attempts per IP and allows another client and a new window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date())
    const init = { headers: { 'X-Real-IP': '203.0.113.1' } }
    for (let index = 0; index < 10; index++) expect((await request({}, init)).status).toBe(400)
    const limited = await request({}, init)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBe(60)
    expect((await request({}, { headers: { 'X-Real-IP': '203.0.113.2' } })).status).toBe(400)
    vi.setSystemTime(Date.now() + 60001)
    expect((await request({}, init)).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })
})
