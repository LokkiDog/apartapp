import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('cleaning start and completion time', () => {
  const service = readFileSync('server/modules/cleaning/cleaning.service.ts', 'utf8')
  const inventoryService = readFileSync('server/modules/inventory/inventory.service.ts', 'utf8')
  const schema = readFileSync('server/infrastructure/database/schema.ts', 'utf8')
  const migration = readFileSync('server/infrastructure/database/migrations/0031_cleaning_started_at.sql', 'utf8')

  it('stores the first start time while moving the cleaning to in progress', () => {
    expect(schema).toContain("startedAt: timestamp('started_at', { withTimezone: true })")
    expect(migration).toContain('ADD COLUMN "started_at" timestamp with time zone')
    expect(service).toContain(".set({ status: 'in_progress', startedAt, linenCollected: cleaning.apartment.automaticLinenCollection ? true : cleaning.linenCollected, updatedAt: startedAt })")
    expect(service).toContain("eq(cleanings.status, 'assigned')")
  })

  it('requires a started cleaning before progress or completion', () => {
    expect(service.match(/if \(cleaning\.status !== 'in_progress'\) throw createError\(\{ statusCode: 409, statusMessage: 'Сначала начните уборку' \}\)/g)).toHaveLength(2)
    expect(service).toContain("completedAt: new Date()")
    expect(inventoryService).toContain("data.sourceType === 'cleaning' && sourceCleaning?.status !== 'in_progress'")
    expect(inventoryService).toContain("cleaning.status !== 'in_progress' && cleaning.status !== 'completed'")
  })
})
