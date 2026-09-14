import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('cleaning guest preparation', () => {
  const schema = readFileSync('server/infrastructure/database/schema.ts', 'utf8')
  const migration = readFileSync('server/infrastructure/database/migrations/0036_cleaning_guest_preparation.sql', 'utf8')
  const service = readFileSync('server/modules/cleaning/guest-preparation.ts', 'utf8')
  const stays = readFileSync('server/modules/stay/stay.service.ts', 'utf8')
  const detail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')

  it('ships an additive snapshot migration and default linen count', () => {
    expect(migration).toContain('ADD COLUMN "default_linen_guest_count" integer DEFAULT 2 NOT NULL')
    expect(migration).toContain('CREATE TABLE "cleaning_guest_preparations"')
    expect(migration).toContain('guest_count_change')
    expect(migration).not.toContain('DROP COLUMN')
    expect(schema).toContain("defaultLinenGuestCount: integer('default_linen_guest_count')")
    expect(schema).toContain("export const cleaningGuestPreparations")
  })

  it('captures the nearest arrival or type default and reconciles booking mutations', () => {
    expect(service).toContain('captureCleaningGuestPreparation')
    expect(service).toContain("source: 'type_default'")
    expect(service).toContain('prepared.guestCount !== current.guestCount')
    expect(service).toContain("origin: 'guest_count_change'")
    expect(stays.match(/reconcileCleaningGuestPreparation\(actor, .+apartmentId\)/g)?.length).toBe(3)
  })

  it('keeps the linen plan safe and visible in the cleaning detail', () => {
    expect(service).toContain('adultCount: stay.adultCount')
    expect(service).toContain('childCount: stay.childCount')
    expect(detail).toContain("t('work.nextArrival')")
    expect(detail).toContain("t('work.noStay')")
    expect(detail).toContain("new Intl.PluralRules(locale.value).select(count)")
    expect(detail).toContain("t('work.preparedForGuests'")
    expect(detail).toContain('linenPlan.mismatch')
    expect(detail).not.toContain('linenGuestBreakdown')
    expect(detail).not.toContain('i-lucide-bed-double')
  })
})
