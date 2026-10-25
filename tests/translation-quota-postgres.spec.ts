import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const url = process.env.TRANSLATION_TEST_DATABASE_URL
let connection: typeof import('../server/infrastructure/database/client').sql
let reserve: typeof import('../server/infrastructure/translation/quota').reserveTranslationCharacters
let translate: typeof import('../server/infrastructure/translation/google').translateServiceName

describe.skipIf(!url)('translation budget PostgreSQL integration', () => {
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/aparts_translation_quota_test') throw new Error('Use the isolated aparts_translation_quota_test database only')
    process.env.DATABASE_URL = url
    connection = (await import('../server/infrastructure/database/client')).sql
    await connection.unsafe('DROP TABLE IF EXISTS translation_monthly_usage')
    await connection.unsafe(readFileSync('server/infrastructure/database/migrations/0046_translation_monthly_usage.sql', 'utf8'))
    reserve = (await import('../server/infrastructure/translation/quota')).reserveTranslationCharacters
    translate = (await import('../server/infrastructure/translation/google')).translateServiceName
  })
  beforeEach(async () => { vi.unstubAllGlobals(); await connection`TRUNCATE translation_monthly_usage` })
  afterAll(async () => { vi.unstubAllGlobals(); await connection?.end() })

  async function used() {
    const [row] = await connection`SELECT sum(characters)::int AS used FROM translation_monthly_usage`
    return row!.used
  }

  it('allows the exact remaining amount and rejects the next request without changing usage', async () => {
    await reserve('abc', 9)
    expect(await used()).toBe(9)
    await expect(reserve('a', 9)).rejects.toMatchObject({ data: { code: 'TRANSLATION_MONTHLY_LIMIT' } })
    expect(await used()).toBe(9)
  })

  it('atomically serializes concurrent reservations across app processes', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserve('a', 9)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(17)
    expect(await used()).toBe(9)
  })

  it('persists usage for separate database connections and ignores prior billing months', async () => {
    await connection`INSERT INTO translation_monthly_usage (month, characters) VALUES ('2000-01', 450000)`
    await reserve('😀', 3)
    const { default: postgres } = await import('postgres')
    const independent = postgres(url!, { max: 1 })
    try {
      const rows = await independent`SELECT characters FROM translation_monthly_usage WHERE month = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM')`
      expect(rows[0]!.characters).toBe(3)
    } finally { await independent.end() }
    await expect(reserve('a', 3)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('disables paid calls at zero and keeps reservations after Google fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('failure', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translate('abc', 'test-key', 0)).rejects.toMatchObject({ data: { code: 'TRANSLATION_MONTHLY_LIMIT' } })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(translate('abc', 'test-key', 9)).rejects.toMatchObject({ data: { code: 'TRANSLATION_FAILED' } })
    expect(await used()).toBe(9)
    fetchMock.mockClear()
    await expect(translate('a', 'test-key', 9)).rejects.toMatchObject({ data: { code: 'TRANSLATION_MONTHLY_LIMIT' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
