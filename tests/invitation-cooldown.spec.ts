import { describe, expect, it } from 'vitest'
import { invitationResendAvailableAt, invitationResendWaitSeconds } from '../server/modules/auth/invitation-cooldown'

describe('invitation resend cooldown', () => {
  const sentAt = new Date('2026-08-29T00:00:00.000Z')

  it('allows another invitation exactly 30 seconds after the previous one', () => {
    expect(invitationResendAvailableAt(sentAt).toISOString()).toBe('2026-08-29T00:00:30.000Z')
    expect(invitationResendWaitSeconds(sentAt, new Date('2026-08-29T00:00:29.001Z'))).toBe(1)
    expect(invitationResendWaitSeconds(sentAt, new Date('2026-08-29T00:00:30.000Z'))).toBe(0)
  })
})
