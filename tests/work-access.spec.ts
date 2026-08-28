import { describe, expect, it } from 'vitest'
import { canAccessAssignedWork, canAccessWorkSection as canAccessServerWork, type Actor } from '../server/infrastructure/auth/actor'
import { canAccessWorkSection as canAccessClientWork, usesManagerOnlyNavigation } from '../src/shared/auth/session'

function actor(id: string, roles: Actor['roles']): Actor {
  return { id, organizationId: 'organization-1', email: `${id}@example.com`, name: id, roles, locale: 'ru' }
}

describe('work access', () => {
  it('keeps the work section unavailable to a manager-only user', () => {
    const manager = actor('manager-1', ['manager'])
    expect(canAccessServerWork(manager)).toBe(false)
    expect(canAccessClientWork(manager)).toBe(false)
    expect(canAccessAssignedWork(manager, manager.id)).toBe(false)
    expect(usesManagerOnlyNavigation(manager)).toBe(true)
  })

  it('allows administrators to access every work record', () => {
    const administrator = actor('administrator-1', ['administrator', 'manager'])
    expect(canAccessServerWork(administrator)).toBe(true)
    expect(canAccessClientWork(administrator)).toBe(true)
    expect(canAccessAssignedWork(administrator, 'cleaner-1')).toBe(true)
    expect(usesManagerOnlyNavigation(administrator)).toBe(false)
  })

  it('limits cleaners, including manager-cleaners, to their own assignments', () => {
    const cleaner = actor('cleaner-1', ['manager', 'cleaner'])
    expect(canAccessServerWork(cleaner)).toBe(true)
    expect(canAccessClientWork(cleaner)).toBe(true)
    expect(canAccessAssignedWork(cleaner, cleaner.id)).toBe(true)
    expect(canAccessAssignedWork(cleaner, 'cleaner-2')).toBe(false)
    expect(canAccessAssignedWork(cleaner, null)).toBe(false)
    expect(usesManagerOnlyNavigation(cleaner)).toBe(false)
  })
})
