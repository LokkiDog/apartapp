import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageFiles = [
  'src/pages/work/WorkPage.vue',
  'src/features/work-detail/ui/WorkDetailPage.vue',
  'src/features/work-progress/ui/WorkProgressForm.vue'
]

function localeValue(locale: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, key) => {
    return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  }, locale)
}

describe('work page UI contracts', () => {
  it('defines every literal translation key in all supported locales', () => {
    const locales = ['ru', 'en', 'he'].map(locale => JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8')) as Record<string, unknown>)
    const keys = new Set<string>()
    for (const file of pageFiles) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(["']([^"']+)["']/g)) keys.add(match[1])
    }
    for (const key of keys) {
      expect(locales.every(locale => localeValue(locale, key) !== undefined), key).toBe(true)
    }
  })

  it('keeps completion inside work details and marks every cleaning row consistently', () => {
    const source = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    expect(source).not.toMatch(/askQuickComplete|quickCompleteOpen|completeOpen|quickCompleteTarget/)
    expect(source).not.toContain('work.complete')
    expect(source.match(/work-cleaning-row--urgent/g)?.length).toBe(6)
    expect(source).toContain('hidden sm:inline')
    expect(source).toContain('sm:hidden')
    expect(source).not.toContain('collapsedFinishedDays')
    expect(source).not.toContain('isFinishedDay')
    expect(source).toContain('const hideFinishedFromToday = ref(false)')
    expect(source).toContain(':aria-pressed="hideFinishedFromToday"')
    expect(source).toContain('workExtra.hideCompleted')
    expect(source).toContain('workExtra.showCompleted')
    expect(source).toContain('buildCleaningPlan(\n    cleanings.value ?? [],\n    today,\n    hideFinishedFromToday.value,')
  })

  it('keeps work rows compact and uses the shared group header spacing', () => {
    const source = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    expect(source).not.toMatch(/work-cleaning-row[^\n]*py-4/)
    expect(source).not.toMatch(/class="flex items-center gap-3 py-4"/)
    expect(source).not.toMatch(/<\/div>\n\s+>\n\s+<\/div>/)
    expect(source.match(/grid size-4 shrink-0 place-items-center rounded-lg bg-\[var\(--color-primary-soft\)\]/g)?.length).toBe(3)
    expect(source.match(/work-group-header[^\n]*py-1/g)?.length).toBe(3)
    expect(source.match(/work-route-order-controls hidden sm:flex/g)?.length).toBe(2)
    expect(source.match(/v-if="isAdministrator"\n\s+class="work-route-order-controls hidden sm:flex"/g)?.length).toBe(2)
    expect(source.match(/<template v-if="!isFinished\(cleaning\)">/g)?.length).toBe(2)
    expect(source.match(/class="work-route-order-button"/g)?.length).toBe(4)
    expect(source.match(/workExtra\.moveUp/g)?.length).toBe(2)
    expect(source.match(/workExtra\.moveDown/g)?.length).toBe(2)
    expect(styles).toContain('.work-route-order-controls {')
    expect(styles).toContain('width: 2rem;')
    expect(styles).toContain('height: 2.75rem;')
    expect(styles).toContain('height: 1.375rem !important;')
    expect(source).toMatch(/cleaningActions[\s\S]*work-route-order-controls/)
  })

  it('uses localized plural forms for active cleaning counters', () => {
    const ru = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    const en = JSON.parse(readFileSync('i18n/locales/en.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    const he = JSON.parse(readFileSync('i18n/locales/he.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    expect(ru.workExtra.activeCleanings.split(' | ')).toHaveLength(3)
    expect(en.workExtra.activeCleanings.split(' | ')).toHaveLength(2)
    expect(he.workExtra.activeCleanings.split(' | ')).toHaveLength(2)
  })
})
