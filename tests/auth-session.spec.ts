import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { defu } from 'defu'
import { Socket } from 'node:net'
import { createEvent, getResponseHeader, useSession } from 'h3'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from '../shared/config/auth-session'
import { refreshUserSession } from '../server/infrastructure/auth/session'
import type { Actor } from '../server/infrastructure/auth/actor'

const actor: Actor = {
  id: 'user-1', organizationId: 'organization-1', email: 'user@example.com',
  name: 'User', roles: ['manager'], locale: 'ru'
}
const config = { password: 'test-session-password-at-least-32-characters', maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS }
const day = 24 * 60 * 60 * 1000

function eventWithCookie(cookie?: string) {
  const request = new IncomingMessage(new Socket())
  if (cookie) request.headers.cookie = cookie
  return createEvent(request, new ServerResponse(request))
}

function cookieFrom(event: ReturnType<typeof createEvent>) {
  const header = getResponseHeader(event, 'set-cookie')
  const cookie = Array.isArray(header) ? header.at(-1)! : String(header)
  return cookie.split(';')[0]!
}

describe('authenticated session policy with persistent cookies', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
    vi.stubGlobal('useRuntimeConfig', () => ({ session: config }))
    vi.stubGlobal('getUserSession', async (event: ReturnType<typeof createEvent>) => (await useSession(event, config)).data)
    vi.stubGlobal('setUserSession', async (event: ReturnType<typeof createEvent>, data: object, overrides: object) => {
      const session = await useSession(event, { ...config, ...overrides })
      await session.update(defu(data, session.data))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses exactly seven days as the idle limit', () => {
    expect(AUTH_SESSION_IDLE_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60)
  })

  it('survives reopening and expires seven days after the latest activity', async () => {
    const login = eventWithCookie()
    await refreshUserSession(login, actor)
    const originalCookie = cookieFrom(login)
    expect(String(getResponseHeader(login, 'set-cookie'))).toContain('Expires=Sat, 10 Oct 2026')

    vi.setSystemTime(Date.now() + 6 * day)
    const activity = eventWithCookie(originalCookie)
    expect((await useSession(activity, config)).data.user).toEqual(actor)
    await refreshUserSession(activity, actor)
    const renewedCookie = cookieFrom(activity)
    expect(String(getResponseHeader(activity, 'set-cookie'))).toContain('Expires=Fri, 16 Oct 2026')

    vi.setSystemTime(Date.now() + 2 * day)
    expect((await useSession(eventWithCookie(originalCookie), config)).data.user).toBeUndefined()
    expect((await useSession(eventWithCookie(renewedCookie), config)).data.user).toEqual(actor)

    vi.setSystemTime(Date.now() + 5 * day + 1)
    expect((await useSession(eventWithCookie(renewedCookie), config)).data.user).toBeUndefined()
  })

  it('starts a fresh seven-day period when logging in with an existing cookie', async () => {
    const firstLogin = eventWithCookie()
    await refreshUserSession(firstLogin, actor)
    vi.setSystemTime(Date.now() + 6 * day)
    const nextLogin = eventWithCookie(cookieFrom(firstLogin))
    await refreshUserSession(nextLogin, { ...actor, id: 'another-user' })
    expect(String(getResponseHeader(nextLogin, 'set-cookie'))).toContain('Expires=Fri, 16 Oct 2026')
    vi.setSystemTime(Date.now() + 6 * day)
    expect((await useSession(eventWithCookie(cookieFrom(nextLogin)), config)).data.user).toEqual({ ...actor, id: 'another-user' })
  })
})
