import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('production Push configuration', () => {
  it('maps required VAPID secrets to Nuxt runtime configuration', () => {
    const compose = readFileSync('docker-compose.prod.yml', 'utf8')

    expect(compose).toContain('NUXT_VAPID_SUBJECT: ${NUXT_VAPID_SUBJECT:?NUXT_VAPID_SUBJECT is required}')
    expect(compose).toContain('NUXT_VAPID_PUBLIC_KEY: ${NUXT_VAPID_PUBLIC_KEY:?NUXT_VAPID_PUBLIC_KEY is required}')
    expect(compose).toContain('NUXT_VAPID_PRIVATE_KEY: ${NUXT_VAPID_PRIVATE_KEY:?NUXT_VAPID_PRIVATE_KEY is required}')
    expect(compose).toContain('NUXT_PUBLIC_VAPID_PUBLIC_KEY: ${NUXT_PUBLIC_VAPID_PUBLIC_KEY:?NUXT_PUBLIC_VAPID_PUBLIC_KEY is required}')
  })

  it('reports a missing public key instead of silently ignoring the action', () => {
    const source = readFileSync('src/features/manage-push-subscription/model/usePushSubscription.ts', 'utf8')

    expect(source).not.toContain('if (!supported.value || !key) return false')
    expect(source).toContain("error.value = 'unavailable'")
  })
})
