import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from '../shared/config/auth-session'
import { refreshUserSession } from '../server/infrastructure/auth/session'
import type { Actor } from '../server/infrastructure/auth/actor'

const replaceUserSession = vi.fn()

vi.stubGlobal('replaceUserSession', replaceUserSession)

const actor: Actor = {
  id: 'user-1',
  organizationId: 'organization-1',
  email: 'user@example.com',
  name: 'User',
  roles: ['manager'],
  locale: 'ru'
}

describe('authenticated session policy', () => {
  beforeEach(() => replaceUserSession.mockReset())

  it('uses exactly ten days as the idle limit', () => {
    expect(AUTH_SESSION_IDLE_MAX_AGE_SECONDS).toBe(10 * 24 * 60 * 60)
  })

  it('replaces the session with the current actor after activity', async () => {
    const event = {} as Parameters<typeof setUserSession>[0]

    await refreshUserSession(event, actor)

    expect(replaceUserSession).toHaveBeenCalledWith(
      event,
      { user: actor },
      { maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS }
    )
  })
})
