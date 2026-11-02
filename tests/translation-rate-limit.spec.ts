import { expect, it, vi } from 'vitest'
import { createEvent, getResponseHeader } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { checkTranslationRateLimit } from '../server/infrastructure/translation/rate-limit'
import type { Actor } from '../server/infrastructure/auth/actor'

it('shares the per-user translation limit, isolates organizations and allows a new window', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100000)
  const actor: Actor = { id: 'rate-test-user', organizationId: 'rate-test-org', email: 'admin@example.test', name: 'Admin', roles: ['administrator'], locale: 'ru' }
  const request = new IncomingMessage(new Socket())
  const event = createEvent(request, new ServerResponse(request))
  try {
    for (let index = 0; index < 10; index++) checkTranslationRateLimit(event, actor)
    expect(() => checkTranslationRateLimit(event, actor)).toThrowError(expect.objectContaining({ statusCode: 429, data: { code: 'TRANSLATION_RATE_LIMIT' } }))
    expect(getResponseHeader(event, 'Retry-After')).toBe(60)
    expect(() => checkTranslationRateLimit(event, { ...actor, organizationId: 'other-rate-org' })).not.toThrow()
    clock.mockReturnValue(160001)
    expect(() => checkTranslationRateLimit(event, actor)).not.toThrow()
  } finally { clock.mockRestore() }
})
