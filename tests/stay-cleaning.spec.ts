import { describe, expect, it } from 'vitest'
import { stayCleaningHref, stayCleaningPresentation } from '../src/pages/calendar/model/stay-cleaning'

describe('stay cleaning presentation', () => {
  it('marks an unassigned stay and links to creation', () => {
    const stay = { id: 'stay-1', cleaning: null }
    expect(stayCleaningPresentation(stay)).toMatchObject({ icon: 'i-lucide-broom', label: 'Уборка не назначена' })
    expect(stayCleaningHref(stay)).toBe('/work?stayId=stay-1')
  })

  it('uses the cleaning status and links to the existing cleaning', () => {
    const stay = { id: 'stay-1', cleaning: { id: 'cleaning-1', status: 'completed', scheduledOn: '2026-08-12' } }
    expect(stayCleaningPresentation(stay)).toMatchObject({ icon: 'i-lucide-broom', label: 'Уборка завершена', className: 'stay-cleaning-indicator--completed' })
    expect(stayCleaningHref(stay)).toBe('/cleanings/cleaning-1')
  })
})
