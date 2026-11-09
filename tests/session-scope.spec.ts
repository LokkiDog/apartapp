import { computed, ref, watch } from 'vue'
import { expect, it, vi } from 'vitest'
import { useCurrentUserScope, type SessionUser } from '../src/shared/auth/session'

it('keeps protected apartment data stable across messaging updates and refreshes it on a client switch', () => {
  const user = ref<SessionUser | null>(null)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useUserSession', () => ({ user }))
  const refresh = vi.fn()
  const stop = watch(useCurrentUserScope(), refresh, { flush: 'sync' })

  try {
    const administrator: SessionUser = {
      id: 'admin', organizationId: 'client-a', contextRevision: '1',
      name: 'Administrator', email: 'admin@example.test', roles: ['administrator'], locale: 'ru',
      messagingEnabled: false
    }
    user.value = administrator
    expect(refresh).toHaveBeenCalledTimes(1)

    user.value = { ...administrator }
    user.value = { ...administrator, messagingEnabled: true }
    expect(refresh).toHaveBeenCalledTimes(1)

    user.value = { ...administrator, organizationId: 'client-b', contextRevision: '2' }
    expect(refresh).toHaveBeenCalledTimes(2)
  } finally {
    stop()
    vi.unstubAllGlobals()
  }
})
