import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveCleaningProblems } from '../server/modules/cleaning/cleaning-problem'

const id = '00000000-0000-4000-8000-000000000001'

describe('cleaning problems', () => {
  it('uses the new multi-problem payload verbatim', () => {
    const problems = [{ id, description: 'Протекает кран' }]
    expect(resolveCleaningProblems({ problems }, { hasProblem: false, problemDescription: '', problems }, [])).toEqual(problems)
  })

  it('keeps an existing problem id for a legacy client payload', () => {
    expect(resolveCleaningProblems(
      { hasProblem: true, problemDescription: 'Новая формулировка' },
      { hasProblem: true, problemDescription: 'Новая формулировка', problems: [] },
      [{ id, description: 'Старое описание' }]
    )).toEqual([{ id, description: 'Новая формулировка' }])
  })

  it('ships an additive migration and problem-scoped attachments', () => {
    const migration = readFileSync('server/infrastructure/database/migrations/0029_cleaning_problems.sql', 'utf8')
    const upload = readFileSync('server/api/attachments/index.post.ts', 'utf8')
    expect(migration).toContain('CREATE TABLE "cleaning_problems"')
    expect(migration).toContain("SET \"entity_type\" = 'cleaning_problem'")
    expect(migration).not.toContain('DROP COLUMN')
    expect(upload).toContain("storedEntityType = 'cleaning_problem'")
    expect(upload).toContain("entityType === 'cleaning_problem'")
  })
})
