import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { dashboardOperations } from '../server/modules/dashboard/operations.service'
import type { Actor } from '../server/infrastructure/auth/actor'

// Denied requests must fail at the role guard, before reading any tenant data.
vi.mock('../server/infrastructure/database/client', () => ({ db: { query: { stays: { findMany: () => { throw new Error('Unexpected database access') } } } } }))
beforeAll(() => { vi.stubGlobal('createError', createError) })
afterAll(() => { vi.unstubAllGlobals() })
describe('operations dashboard access', () => {
  it.each<Actor['roles']>([['manager'], ['cleaner'], ['specialist'], ['manager', 'cleaner'], []])('denies roles %j', async (...roles) => {
    const actor: Actor = { id: 'user', organizationId: 'organization', name: 'User', email: 'user@example.com', locale: 'ru', roles }
    await expect(dashboardOperations(actor)).rejects.toMatchObject({ statusCode: 403 })
  })
})
