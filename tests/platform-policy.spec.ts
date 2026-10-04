import { afterEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { resolvePlatformAccess } from '../server/infrastructure/auth/platform'
import { registrationInputSchema, clientUpdateSchema, timezoneSchema } from '../shared/contracts/platform'

afterEach(() => vi.unstubAllGlobals())
describe('client access policy', () => {
  it('binds ordinary accounts to their own active client', () => {
    vi.stubGlobal('createError', createError)
    const user = { organizationId: 'a', isSuperuser: false }
    expect(resolvePlatformAccess(user, 'a', 'active')).toEqual({ inSystem: false })
    expect(() => resolvePlatformAccess(user, 'b', 'active')).toThrow('Нет доступа')
    expect(() => resolvePlatformAccess(user, 'a', 'blocked')).toThrow('заблокирован')
    expect(() => resolvePlatformAccess(user, null)).toThrow('Нет доступа')
  })
  it('lets a superuser support a selected blocked client and otherwise use the system console', () => {
    const user = { organizationId: 'a', isSuperuser: true }
    expect(resolvePlatformAccess(user, null)).toEqual({ inSystem: true })
    expect(resolvePlatformAccess(user, 'b', 'blocked')).toEqual({ inSystem: false })
  })
  it('normalizes identity and never accepts privilege fields from public forms', () => {
    const input = registrationInputSchema.parse({ companyName: 'Company', name: 'Admin', email: ' ADMIN@EXAMPLE.COM ', password: 'password123', isSuperuser: true, organizationId: 'foreign' })
    expect(input.email).toBe('admin@example.com')
    expect(input).not.toHaveProperty('isSuperuser')
    expect(input).not.toHaveProperty('organizationId')
    expect(clientUpdateSchema.safeParse({ isSuperuser: true }).success).toBe(false)
    expect(timezoneSchema.safeParse('Europe/Sofia').success).toBe(true)
    expect(timezoneSchema.safeParse('invalid/timezone').success).toBe(false)
  })
})
