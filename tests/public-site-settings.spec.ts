import { expect, it, vi } from 'vitest'
import { createEvent, getQuery } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { contactPhoneSchema, publicSiteInputSchema, socialContactSchema, websiteUrlSchema } from '../shared/contracts/public-site'
import { catalogueOrigin, catalogueRead } from '../guest/server/utils/catalogue'

it('accepts website origins and rejects paths, credentials and unsupported URL schemes', () => {
  expect(websiteUrlSchema.parse(' HTTPS://EXAMPLE.TEST:443/ ')).toBe('https://example.test')
  expect(websiteUrlSchema.parse('http://localhost:3001')).toBe('http://localhost:3001')
  for (const value of ['https://user:pass@example.test', 'javascript:alert(1)', 'https://example.test/path', 'https://example.test/?secret=x', 'https://example.test/#fragment']) expect(websiteUrlSchema.safeParse(value).success).toBe(false)
  expect(publicSiteInputSchema.safeParse({ enabled: true, websiteUrl: 'https://example.test', hostUserId: null }).success).toBe(false)
  expect(contactPhoneSchema.parse('+359 (888) 123-456')).toBe('+359 (888) 123-456')
  for (const phone of ['123', 'bad phone', '0'.repeat(12)]) expect(contactPhoneSchema.safeParse(phone).success).toBe(false)
})
it('validates social contacts while the user is still typing and publishes only safe link schemes', () => {
  for (const value of ['', 'x', 'https://', 'javascript:alert(1)', 'https://user:pass@example.test']) {
    expect(socialContactSchema.safeParse({ platform: 'telegram', value }).success).toBe(false)
  }
  expect(socialContactSchema.parse({ platform: 'telegram', value: '@publichost' }).value).toBe('@publichost')
  expect(socialContactSchema.parse({ platform: 'instagram', value: 'https://example.test/host' }).value).toBe('https://example.test/host')
  expect(socialContactSchema.safeParse({ platform: 'whatsapp', value: 'https://example.test' }).success).toBe(false)
})
it('selects the request origin behind Nginx and never trusts a visitor supplied site query', async () => {
  const request = new IncomingMessage(new Socket()); request.url = '/sitemap.xml?site=https://foreign.test'; request.headers = { host: 'guest:3001', 'x-forwarded-host': 'public.example.test', 'x-forwarded-proto': 'https' }
  const event = createEvent(request, new ServerResponse(request))
  expect(catalogueOrigin(event)).toBe('https://public.example.test')
  expect(getQuery(event).site).toBe('https://foreign.test')
  const fetcher = vi.fn(async (_url: string, options: { query: { site: string } }) => ({ websiteUrl: options.query.site }))
  vi.stubGlobal('$fetch', fetcher)
  vi.stubGlobal('useRuntimeConfig', () => ({ catalogueApiBase: 'http://crm:3000' }))
  try { expect(await catalogueRead(event, 'site')).toEqual({ websiteUrl: 'https://public.example.test' }) }
  finally { vi.unstubAllGlobals() }
})
