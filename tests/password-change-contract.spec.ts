import { describe, expect, it } from 'vitest'
import { changePasswordSchema } from '../shared/contracts/platform'

describe('password change request', () => {
  it.each([
    ['existing', '12345678', true],
    ['existing', 'x'.repeat(200), true],
    ['', '12345678', false],
    ['existing', '1234567', false],
    ['existing', 'x'.repeat(201), false],
    ['x'.repeat(201), '12345678', false]
  ])('validates password lengths (case %#)', (currentPassword, newPassword, accepted) => {
    expect(changePasswordSchema.safeParse({ currentPassword, newPassword }).success).toBe(accepted)
  })
  it('rejects a client-selected account identity', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'existing', newPassword: '12345678', userId: 'another-user' }).success).toBe(false)
  })
})
