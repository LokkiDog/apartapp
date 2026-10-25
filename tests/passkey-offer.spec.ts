import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePasskeys } from '../src/shared/lib/passkeys'

const { startRegistration } = vi.hoisted(() => ({ startRegistration: vi.fn() }))
vi.mock('@simplewebauthn/browser', () => ({ startRegistration }))

describe('passkey offer after password sign-in', () => {
  let identity: ReturnType<typeof ref<{ id: string } | null>>
  let storage: Map<string, string>
  let existingKeys: Array<{ id: string }>
  let registered: unknown[]
  let state: Map<string, ReturnType<typeof ref>>
  let failure: string | undefined

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T00:00:00Z'))
    identity = ref({ id: 'user-a' }); storage = new Map(); state = new Map(); existingKeys = []; registered = []; failure = undefined
    startRegistration.mockReset().mockResolvedValue({ id: 'created-key' })
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('onMounted', (callback: () => void) => callback())
    vi.stubGlobal('useState', (key: string, init: () => unknown) => {
      if (!state.has(key)) state.set(key, ref(init()))
      return state.get(key)
    })
    vi.stubGlobal('useUserSession', () => ({ user: identity }))
    vi.stubGlobal('PublicKeyCredential', class {})
    vi.stubGlobal('window', { isSecureContext: true, localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    } })
    vi.stubGlobal('$fetch', async (url: string, options?: { body: unknown }) => {
      if (url === failure) throw new Error('unavailable')
      if (url === '/api/auth/passkeys') return existingKeys
      if (url === '/api/auth/passkeys/registration-options') return { attemptId: 'attempt', options: { challenge: 'public-challenge' } }
      if (url === '/api/auth/passkeys/register') { registered.push(options?.body); return { ok: true } }
      throw new Error(`Unexpected request: ${url}`)
    })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('offers enrollment across navigation, creates only after consent and never persists the password', async () => {
    const login = usePasskeys()
    await login.offerAfterLogin('secret-password')
    const shell = usePasskeys()
    expect(shell.offer.value?.userId).toBe('user-a')
    expect(JSON.stringify([...state.values()].map(value => value.value))).not.toContain('secret-password')
    expect(storage.size).toBe(0)
    expect(startRegistration).not.toHaveBeenCalled()
    expect(await shell.acceptOffer('My phone')).toBe(true)
    expect(registered).toEqual([{ attemptId: 'attempt', response: { id: 'created-key' }, name: 'My phone' }])
    expect(shell.offer.value).toBeNull()
  })
  it('postpones for 30 days per account in this browser and keeps manual enrollment available', async () => {
    const passkeys = usePasskeys()
    await passkeys.offerAfterLogin('password'); passkeys.postponeOffer()
    expect(passkeys.offer.value).toBeNull()
    expect(registered).toEqual([])
    vi.setSystemTime(Date.now() + 29 * 86400000)
    await passkeys.offerAfterLogin('password')
    expect(passkeys.offer.value).toBeNull()
    identity.value = { id: 'user-b' }
    await passkeys.offerAfterLogin('password')
    expect(passkeys.offer.value?.userId).toBe('user-b')
    identity.value = { id: 'user-a' }
    vi.setSystemTime(Date.now() + 2 * 86400000)
    await passkeys.offerAfterLogin('password')
    expect(passkeys.offer.value?.userId).toBe('user-a')
    passkeys.postponeOffer()
    await passkeys.register('password', 'Manual key')
    expect(registered).toHaveLength(1)
  })
  it('skips existing keys and unsupported browsers and tolerates optional API failures', async () => {
    const passkeys = usePasskeys()
    existingKeys = [{ id: 'existing' }]
    await passkeys.offerAfterLogin('password')
    expect(passkeys.offer.value).toBeNull()
    existingKeys = []; passkeys.supported.value = false
    await passkeys.offerAfterLogin('password')
    expect(passkeys.offer.value).toBeNull()
    passkeys.supported.value = true
    for (const url of ['/api/auth/passkeys', '/api/auth/passkeys/registration-options']) {
      failure = url
      await expect(passkeys.offerAfterLogin('password')).resolves.toBeUndefined()
      expect(passkeys.offer.value).toBeNull()
    }
  })
  it('does not reuse an offer for another account or after the challenge expires', async () => {
    const passkeys = usePasskeys()
    await passkeys.offerAfterLogin('password')
    identity.value = { id: 'user-b' }
    expect(await passkeys.acceptOffer('Phone')).toBe(false)
    await passkeys.offerAfterLogin('password')
    vi.setSystemTime(Date.now() + 300000)
    expect(await passkeys.acceptOffer('Phone')).toBe(false)
    expect(startRegistration).not.toHaveBeenCalled()
    expect(registered).toEqual([])
  })
  it('allows retrying a cancelled device prompt without asking for the password again', async () => {
    const passkeys = usePasskeys()
    await passkeys.offerAfterLogin('password')
    startRegistration.mockRejectedValueOnce(Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' }))
    await expect(passkeys.acceptOffer('Phone')).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(passkeys.offer.value).not.toBeNull()
    expect(await passkeys.acceptOffer('Phone')).toBe(true)
    expect(registered).toHaveLength(1)
  })
})
