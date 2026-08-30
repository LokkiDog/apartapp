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
    expect(source.match(/work-cleaning-row work-route-cleaning-row group items-center gap-3/g)?.length).toBe(2)
    expect(source).not.toContain('work-route-cleaning-row group flex items-center justify-between')
    expect(source.match(/class="work-route-cleaning-row__content"/g)?.length).toBe(2)
    expect(source).not.toContain('sm:flex-1')
    expect(source.match(/class="work-route-cleaning-row__urgent-dot"/g)?.length).toBe(2)
    expect(source.match(/class="work-cleaning-row__urgent-label work-route-cleaning-row__urgent-text"/g)?.length).toBe(2)
    expect(source.match(/class="work-route-cleaning-row__mobile-hotel"/g)?.length).toBe(2)
    expect(source.match(/class="work-route-cleaning-row__mobile-subtitle"/g)?.length).toBe(2)
    expect(source.match(/class="work-route-cleaning-row__desktop-subtitle"/g)?.length).toBe(2)
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
    expect(styles).toContain('.work-route-cleaning-row {\n  display: grid;\n  grid-template-columns: 1rem minmax(0, 1fr) max-content 2.75rem;\n  padding-inline: 0.5rem;\n}')
    expect(styles).toContain('.work-route-cleaning-row__content {\n  min-width: 0;\n}')
    expect(styles).toContain('.work-route-cleaning-row__urgent-dot {')
    expect(styles).toContain('background-color: #dc2626;')
    expect(styles).toContain('.work-route-cleaning-row__urgent-text,\n.work-route-cleaning-row__urgent-separator,\n.work-route-cleaning-row__desktop-subtitle {\n  display: none;\n}')
    expect(styles).toContain('.work-route-cleaning-row {\n    display: flex;\n  }')
    expect(styles).toContain('.work-route-cleaning-row__content {\n    flex: 1 1 0%;\n  }')
    expect(styles).toContain('.work-route-cleaning-row__urgent-text,\n  .work-route-cleaning-row__urgent-separator,\n  .work-route-cleaning-row__desktop-subtitle {\n    display: inline;\n  }')
    expect(styles).not.toContain('article[draggable].group {')
    expect(styles).not.toContain('article[draggable].group > .min-w-0.flex-1')
    expect(source).toMatch(/cleaningActions[\s\S]*work-route-order-controls/)
    expect(source).toContain('class="work-task-row group items-center gap-3"')
    expect(source).toContain('class="work-task-row__content"')
    expect(source).toContain('class="work-task-row__priority"')
    expect(source).toContain('class="work-task-row__status"')
    expect(source).toContain('class="work-task-row__menu"')
    expect(source).toContain('class="work-task-row__priority-dot"')
    expect(source).toContain('class="work-task-row__mobile-apartment"')
    expect(source).toContain('class="work-task-row__mobile-subtitle"')
    expect(source).toContain('class="work-task-row__desktop-subtitle"')
    expect(source).not.toContain('<UAlert\n            v-if="task.hasProblem"')
    expect(styles).toContain('.work-task-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) max-content;\n  grid-template-rows: auto auto;')
    expect(styles).toContain('column-gap: 0.75rem;\n  row-gap: 0;')
    expect(styles).toContain('.work-task-row__content {\n  grid-column: 1;\n  grid-row: 1 / -1;\n  align-self: center;\n  min-width: 0;\n}')
    expect(styles).toContain('.work-task-row__icon {\n  display: none;')
    expect(styles).toContain('.work-task-row__priority {\n  display: none;\n}')
    expect(styles).toContain('.work-task-row__status {\n  grid-column: 2;\n  grid-row: 1;\n  align-self: start;\n  justify-self: end;\n}')
    expect(styles).toContain('.work-task-row__menu {\n  grid-column: 2;\n  grid-row: 2;\n  align-self: end;\n  justify-self: end;\n}')
    expect(styles).toContain('.work-task-row {\n    display: flex;')
    expect(styles).toContain('.work-task-row__content {\n    flex: 1 1 0%;\n  }')
    expect(styles).toContain('.work-task-row__icon {\n    display: grid;')
    expect(styles).toContain('.work-task-row__status,\n  .work-task-row__menu {\n    align-self: center;\n    justify-self: auto;\n  }')
    expect(styles).toContain('.work-task-row__priority {\n    display: inline-flex;\n  }')
    expect(styles).toContain('.work-task-row__priority-dot,\n  .work-task-row__mobile-apartment,\n  .work-task-row__mobile-subtitle {\n    display: none;\n  }')
    expect(styles).toContain('.work-task-row__desktop-subtitle {\n    display: inline;\n  }')
  })

  it('uses localized plural forms for active cleaning counters', () => {
    const ru = JSON.parse(readFileSync('i18n/locales/ru.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    const en = JSON.parse(readFileSync('i18n/locales/en.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    const he = JSON.parse(readFileSync('i18n/locales/he.json', 'utf8')) as { workExtra: { activeCleanings: string } }
    expect(ru.workExtra.activeCleanings.split(' | ')).toHaveLength(3)
    expect(en.workExtra.activeCleanings.split(' | ')).toHaveLength(2)
    expect(he.workExtra.activeCleanings.split(' | ')).toHaveLength(2)
  })

  it('provides the task detail endpoint used by task cards', () => {
    const taskPage = readFileSync('app/pages/tasks/[id].vue', 'utf8')
    const taskDetail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')
    const taskEndpoint = readFileSync('server/api/tasks/[id].get.ts', 'utf8')

    expect(taskPage).toContain('<WorkDetailPage kind="task" />')
    expect(taskDetail).toContain('`/api/${props.kind}s/${id}`')
    expect(taskEndpoint).toContain("const task = (await listTasks(actor)).find(item => item.id === taskId)")
    expect(taskEndpoint).toContain("statusCode: 404, statusMessage: 'Задача не найдена'")
  })

  it('keeps work detail cards inside the mobile viewport', () => {
    const detail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')
    const progress = readFileSync('src/features/work-progress/ui/WorkProgressForm.vue', 'utf8')
    const styles = readFileSync('src/app/styles/main.css', 'utf8')
    expect(styles).toContain('.work-progress-form {\n  display: grid;\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  grid-template-columns: minmax(0, 1fr);')
    expect(styles).toContain('.work-progress-form > * {\n  max-width: 100%;\n  min-width: 0;\n}')
    expect(styles).toContain('.progress-section {\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;')
    expect(styles).toContain('.progress-section__heading > div,\n.progress-stock-list,\n.progress-stock-row,\n.progress-stock-fields > * {\n  min-width: 0;\n}')
    expect(styles).toContain('.work-progress-actions--in-cleaning,\n  .work-progress-actions__secondary {\n    min-width: 0;\n    flex-wrap: wrap;\n  }')
    expect(styles).toContain('.work-progress-actions--in-cleaning .work-progress-actions__primary {\n    position: fixed;\n    z-index: 24;\n    right: 0;\n    bottom: calc(3.9rem + env(safe-area-inset-bottom));\n    left: 0;')
    expect(styles).toContain('flex-direction: row;\n    flex-wrap: nowrap;\n    align-items: center;\n    justify-content: space-between;')
    expect(progress).toContain('photos: File[]')
    expect(progress).toContain('attachments?: Array<{ id: string; fileName: string }>')
    expect(progress).toContain('type="file" accept="image/*" multiple')
    expect(progress).toContain('class="work-attachment-card__image"')
    expect(progress).toContain('URL.createObjectURL(file)')
    expect(progress).toContain('URL.revokeObjectURL(preview.url)')
    expect(progress).toContain('attachments.length || photoPreviews.length')
    expect(progress).toContain('class="work-attachment-card work-attachment-card--preview"')
    expect(progress).toContain(':src="preview.url"')
    expect(progress).not.toContain("{{ t('progress.selected') }}: {{ photo.name }}")
    expect(progress).toContain('<UForm :key="validation.formKey.value" :state="validationState" :validate="validateProgress"')
    expect(progress).toContain('<UAlert v-if="validationError || error"')
    expect(progress.indexOf('<UAlert v-if="validationError || error"')).toBeLessThan(progress.indexOf('<section v-if="kind === \'cleaning\'"'))
    expect(progress).toContain('name="problemDescription" :label="t(\'progress.problemDescription\')" :error="false"')
    expect(progress).toContain(':name="`inventoryReports.${index}.usedQuantity`" :error="false"')
    expect(progress).toContain('v-for="(item, index) in checklist"')
    expect(progress).toContain(':name="`checklist.${index}.checked`" :error="false"')
    expect(progress).not.toContain('<UFormField v-if="checklist.length" name="checklist"')
    expect(progress).toContain("[{ name: `checklist.${index}.checked`, message: t('work.incompleteHint') }]")
    expect(progress).not.toContain('<UAlert v-if="error" color="error" variant="soft" :description="error" />')
    expect(detail).toContain('async function uploadPhotos(photos: File[])')
    expect(detail).toContain(':attachments="attachments"')
    expect(detail).not.toContain('async function uploadPhoto(photo: File | null)')
    expect(styles).toContain('.work-attachment-gallery {\n  display: grid;\n  min-width: 0;\n  grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(styles).toContain('.work-attachment-card__image {\n  display: block;\n  width: 100%;\n  aspect-ratio: 4 / 3;\n  object-fit: cover;\n  outline: 1px solid rgba(0, 0, 0, 0.1);')
    expect(styles).toContain('.work-attachment-card--preview {\n  box-shadow: inset 0 0 0 1px rgb(42 119 88 / 0.18);\n}')
  })
})
