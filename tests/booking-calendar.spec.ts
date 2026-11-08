import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, toWebHandler } from 'h3'
import post from '../server/api/public/booking/calendar.post'
import options from '../server/api/public/booking/calendar.options'
import security from '../server/middleware/platform-security'

const eventId = '11111111-1111-4111-8111-111111111111'
const inviteeId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const eventUri = 'https://api.calendly.com/scheduled_events/' + eventId
const inviteeUri = eventUri + '/invitees/' + inviteeId
const origin = 'https://magicmopcrm.com'
const config = {
  public: { brand: { id: 'magicmop' } },
  recaptchaAllowedOrigins: origin, recaptchaMinimumScore: '0.5',
  calendlyApiToken: 'private-calendly-token', calendlyEventName: 'Демо MagicMop'
}
const provider = vi.fn()
let ip = 0
let event: Record<string, unknown>
let invitee: Record<string, unknown>
const app = createApp()
app.use(security)
app.use(createRouter().post('/api/public/booking/calendar', post).options('/api/public/booking/calendar', options))
const handle = toWebHandler(app)
function request(body: unknown = { eventId, inviteeId }, init: RequestInit = {}) {
  return handle(new Request('https://app.magicmopcrm.com/api/public/booking/calendar', {
    method: 'POST', body: JSON.stringify(body), ...init,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Real-IP': '198.18.0.' + (++ip), ...init.headers }
  }))
}
beforeEach(() => {
  config.public.brand.id = 'magicmop'
  config.calendlyApiToken = 'private-calendly-token'
  event = {
    uri: eventUri, name: 'Демо MagicMop', status: 'active',
    start_time: '2026-11-09T03:00:00Z', end_time: '2026-11-09T03:30:00Z',
    location: { type: 'zoom', join_url: 'https://us06web.zoom.us/j/123456789?pwd=example' },
    meeting_notes_plain: 'Private internal notes', event_guests: [{ email: 'private@example.com' }]
  }
  invitee = {
    uri: inviteeUri, event: eventUri, status: 'active', timezone: 'Asia/Bangkok',
    email: 'private@example.com', name: 'Private user', cancel_url: 'https://calendly.com/cancellations/private'
  }
  provider.mockReset().mockImplementation(async (url: string) => Response.json({ resource: url.includes('/invitees/') ? invitee : event }))
  vi.stubGlobal('fetch', provider)
  vi.stubGlobal('useRuntimeConfig', () => config)
})
afterEach(() => vi.unstubAllGlobals())

describe('booked meeting calendar HTTP contract', () => {
  it('returns only the active booked event details and Zoom link without participant PII', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      title: 'Демо MagicMop', startTime: '2026-11-09T03:00:00Z', endTime: '2026-11-09T03:30:00Z',
      timeZone: 'Asia/Bangkok', joinUrl: 'https://us06web.zoom.us/j/123456789?pwd=example',
      uid: 'magicmop-demo-' + eventId + '@magicmopcrm.com'
    })
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(provider.mock.calls.map(call => call[0]).sort()).toEqual([eventUri, inviteeUri].sort())
    for (const [, init] of provider.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer private-calendly-token')
      expect(init.redirect).toBe('error')
    }
  })

  it('allows the landing preflight without credentials and rejects another origin or brand', async () => {
    const preflight = await request(undefined, { method: 'OPTIONS', body: undefined, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()
    expect((await request(undefined, { headers: { Origin: 'https://attacker.example' } })).status).toBe(403)
    config.public.brand.id = 'aparts'
    expect((await request()).status).toBe(404)
    expect(provider).not.toHaveBeenCalled()
  })

  it.each([null, {}, { eventId }, { eventId: 'https://attacker.example', inviteeId }, { eventId, inviteeId, token: 'client-token' }])('rejects invalid references before making API requests %#', async body => {
    expect((await request(body)).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it.each(['event-pair', 'invitee-pair', 'invitee-uri', 'foreign-uri', 'event-name'])('refuses unrelated resources: %s', async kind => {
    if (kind === 'event-pair') invitee.event = 'https://api.calendly.com/scheduled_events/' + otherId
    if (kind === 'invitee-pair') invitee.uri = eventUri + '/invitees/' + otherId
    if (kind === 'invitee-uri') invitee.uri = 'https://api.calendly.com/scheduled_events/' + otherId + '/invitees/' + inviteeId
    if (kind === 'foreign-uri') event.uri = 'https://attacker.example/scheduled_events/' + eventId
    if (kind === 'event-name') event.name = 'Private consultation'
    expect((await request()).status).toBe(404)
  })

  it.each(['event', 'invitee'])('refuses canceled %s', async target => {
    if (target === 'event') event.status = 'canceled'
    else invitee.status = 'canceled'
    expect((await request()).status).toBe(410)
  })

  it('returns the scheduled time while Zoom is still provisioning, without inventing a link', async () => {
    event.location = { type: 'zoom', join_url: null }
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ joinUrl: null, startTime: '2026-11-09T03:00:00Z' })
  })

  it.each(['javascript:alert(1)', 'https://zoom.us.attacker.example/j/1', 'http://zoom.us/j/1', 'https://user:secret@zoom.us/j/1', 'https://zoom.us:8443/j/1'])('refuses unsafe Zoom URL %s', async url => {
    event.location = { type: 'zoom', join_url: url }
    expect((await request()).status).toBe(503)
  })

  it('preserves absolute times and uses UTC when the invitee timezone is missing or invalid', async () => {
    invitee.timezone = 'invalid/timezone'
    expect(await (await request()).json()).toMatchObject({ timeZone: 'UTC', startTime: '2026-11-09T03:00:00Z' })
  })

  it('does not return an invalid time range', async () => {
    event.end_time = event.start_time
    expect((await request()).status).toBe(503)
  })

  it('hides provider failures and missing configuration', async () => {
    config.calendlyApiToken = ''
    expect((await request()).status).toBe(503)
    expect(provider).not.toHaveBeenCalled()
    config.calendlyApiToken = 'private-calendly-token'
    provider.mockRejectedValue(new Error('private-calendly-token private@example.com'))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/private-calendly-token|private@example.com/)
  })

  it('rejects incomplete provider responses', async () => {
    provider.mockResolvedValue(Response.json({ resource: {} }))
    expect((await request()).status).toBe(503)
  })
})
