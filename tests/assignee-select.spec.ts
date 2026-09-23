import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const assignmentSurfaces = [
  'src/shared/ui/GroupedUserMultiSelect.vue',
  'src/pages/work/WorkPage.vue',
  'src/pages/problems/ProblemsPage.vue'
]

describe('assignee selection on mobile', () => {
  it('keeps the keyboard closed until the user focuses the search input', () => {
    for (const path of assignmentSurfaces) {
      const component = readFileSync(path, 'utf8')
      expect(component).toContain('USelectMenu')
      expect(component).toContain("autofocus: false")
      expect(component).toMatch(/searchPlaceholder|searchAssignee/)
    }
  })

  it('uses a bounded touch-scrollable users viewport', () => {
    const styles = readFileSync('src/app/styles/main.css', 'utf8')

    for (const path of assignmentSurfaces) {
      const component = readFileSync(path, 'utf8')
      expect(component).toContain('assignee-select-menu')
      expect(component).toContain('overflow-y-auto overscroll-contain touch-pan-y')
      expect(component).toContain('bodyLock: true')
    }

    expect(styles).toContain('.assignee-select-menu [data-slot="viewport"]')
    expect(styles).toContain('-webkit-overflow-scrolling: touch')
    expect(styles).toContain('overscroll-behavior: contain')
  })

  it('reuses the grouped selector for cleanings and manual notifications', () => {
    const cleaning = readFileSync('src/features/manage-cleaning/ui/CleaningFormSlideover.vue', 'utf8')
    const notifications = readFileSync('src/pages/notifications/NotificationsPage.vue', 'utf8')
    expect(cleaning).toContain('<GroupedUserMultiSelect')
    expect(cleaning).toContain("t('common.searchAssignee')")
    expect(notifications).toContain('<GroupedUserMultiSelect')
    expect(notifications).toContain(':groups="recipientGroups"')
  })
})
