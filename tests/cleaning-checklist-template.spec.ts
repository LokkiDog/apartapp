import { describe, expect, it } from 'vitest'
import { buildCleaningChecklist, isUntouchedChecklistTemplate, sofiaToday } from '../server/modules/cleaning/checklist-template'

describe('cleaning checklist template', () => {
  const template = buildCleaningChecklist(['Из типа'], ['Из апартамента'])

  it('recognizes only an unchanged and unchecked template as safe to synchronize', () => {
    expect(isUntouchedChecklistTemplate(template, template)).toBe(true)
    expect(isUntouchedChecklistTemplate([{ label: 'Из типа', checked: true }, { label: 'Из апартамента', checked: false }], template)).toBe(false)
    expect(isUntouchedChecklistTemplate([{ label: 'Свой пункт', checked: false }], template)).toBe(false)
  })

  it('uses the Sofia calendar date for future-cleaning eligibility', () => {
    expect(sofiaToday(new Date('2026-09-06T21:30:00.000Z'))).toBe('2026-09-07')
  })
})
