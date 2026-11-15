import { describe, expect, it } from 'vitest'
import { crmDatabaseUrl } from '../shared/config/crm-database'

describe('CRM PostgreSQL target', () => {
  it.each([
    ['magicmop', 'postgresql://magicmop@127.0.0.1:52951/magicmop'],
    ['magicmop', 'postgresql://magicmop@postgres:5432/magicmop'],
    ['aparts', 'postgresql://aparts@localhost:55432/aparts'],
  ])('accepts the database configured for %s', (brand, url) => {
    expect(crmDatabaseUrl(brand, url)).toBe(url)
  })

  it.each([
    ['magicmop', undefined],
    ['magicmop', 'postgres://user:private@postgres:5432/aparts'],
    ['magicmop', 'postgres://user:private@localhost:55432/magicmop'],
    ['magicmop', 'postgres://user:private@postgres-aparts:5432/magicmop'],
    ['magicmop', 'postgres://user:private@postgres:5432/magicmop?dbname=aparts'],
    ['aparts', 'postgres://user:private@127.0.0.1:52951/magicmop'],
  ])('rejects a missing or mismatched %s database without disclosing credentials', (brand, url) => {
    expect(() => crmDatabaseUrl(brand, url)).toThrow(/DATABASE_URL/)
    expect(() => crmDatabaseUrl(brand, url)).not.toThrow(/private/)
  })
})
