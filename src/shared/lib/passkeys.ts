type Enrollment = Awaited<ReturnType<typeof registrationOptions>>
type EnrollmentOffer = Enrollment & { userId: string; expiresAt: number }
const dismissalKey = (userId: string) => `aparts:passkey-offer:${userId}`
const offerCooldown = 30 * 24 * 60 * 60 * 1000

function registrationOptions(password: string, timeout = 10_000) {
  return $fetch('/api/auth/passkeys/registration-options', { method: 'POST', body: { password }, timeout, retry: false })
}

export function usePasskeys() {
  const supported = ref(false)
  // Keep only the public ceremony options in memory across navigation. Never
  // persist the password or the challenge in local/session storage.
  const offer = useState<EnrollmentOffer | null>('passkey-enrollment-offer', () => null)
  onMounted(() => { supported.value = window.isSecureContext && typeof PublicKeyCredential !== 'undefined' })

  async function authenticate() {
    const { startAuthentication } = await import('@simplewebauthn/browser')
    const { options, attemptId } = await $fetch('/api/auth/passkeys/authentication-options', { method: 'POST' })
    const response = await startAuthentication({ optionsJSON: options })
    await $fetch('/api/auth/passkeys/authenticate', { method: 'POST', body: { attemptId, response } })
  }

  async function finishRegistration(enrollment: Enrollment, name: string) {
    const { startRegistration } = await import('@simplewebauthn/browser')
    const { options, attemptId } = enrollment
    const response = await startRegistration({ optionsJSON: options })
    await $fetch('/api/auth/passkeys/register', { method: 'POST', body: { attemptId, response, name } })
  }

  async function register(password: string, name: string) {
    await finishRegistration(await registrationOptions(password), name)
    offer.value = null
  }

  async function offerAfterLogin(password: string) {
    offer.value = null
    const userId = (useUserSession().user.value as { id?: string } | null)?.id
    if (!supported.value || !userId) return
    try {
      try {
        if (Number(window.localStorage.getItem(dismissalKey(userId))) > Date.now()) return
      } catch { /* Browser storage may be disabled; sign-in must still work. */ }
      const keys = await $fetch('/api/auth/passkeys', { timeout: 3_000, retry: false })
      if (keys.length) return
      const enrollment = await registrationOptions(password, 3_000)
      if ((useUserSession().user.value as { id?: string } | null)?.id !== userId) return
      offer.value = { ...enrollment, userId, expiresAt: Date.now() + 300_000 }
    } catch { /* An optional offer must never prevent password sign-in. */ }
  }

  function postponeOffer() {
    if (offer.value) {
      try { window.localStorage.setItem(dismissalKey(offer.value.userId), String(Date.now() + offerCooldown)) } catch { /* Storage is optional. */ }
    }
    offer.value = null
  }

  async function acceptOffer(name: string) {
    const current = offer.value
    const userId = (useUserSession().user.value as { id?: string } | null)?.id
    if (!current || current.userId !== userId || current.expiresAt <= Date.now()) {
      offer.value = null
      return false
    }
    await finishRegistration(current, name)
    offer.value = null
    return true
  }

  return { supported, authenticate, register, offer, offerAfterLogin, postponeOffer, acceptOffer }
}
