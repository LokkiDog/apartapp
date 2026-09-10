import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('src/pages/settings/UsersSettingsPage.vue', 'utf8')
const styles = readFileSync('src/app/styles/main.css', 'utf8')

describe('users list row layout', () => {
  it('keeps identity, roles, status, and one menu in a stable order without an avatar', () => {
    const row = page.slice(page.indexOf('<div v-else-if="visibleUsers.length"'), page.indexOf('<EmptyState'))

    expect(row).toContain('class="user-list-row__identity"')
    expect(row).toContain('class="user-list-row__roles"')
    expect(row).toContain('class="user-list-row__status"')
    expect(row).toContain('<UDropdownMenu v-if="userMenuItems(member).length"')
    expect(row).not.toContain('<UAvatar')
    expect(row).not.toContain('<UCheckbox')
    expect(row).not.toContain('i-lucide-archive"')
  })

  it('keeps mobile rows on the same four-column grid and compacts extra roles', () => {
    expect(styles.replace(/\s+/g, ' ')).toContain('grid-template-columns: minmax(8rem, 1fr) minmax(6.5rem, 1fr) minmax(0, 4.5rem) 2.75rem;')
    expect(styles).toContain('gap: 0.25rem;')
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(8rem, 13rem) 8rem 2.75rem;')
    expect(page).toContain('mobileRoleLabel(member)')
    expect(page).toContain("v-if=\"member.roles.length > 1\"")
    expect(page).toContain('+{{ member.roles.length - 1 }}')
  })

  it('uses an accessible status dot on mobile and retains the text badge from sm', () => {
    expect(page).toContain('class="user-list-row__status-dot"')
    expect(page).toContain('role="img" :aria-label="statusLabel(member.status)"')
    expect(styles).toContain(".user-list-row__status-badge {\n  display: none;")
    expect(styles).toContain(".user-list-row__status-dot {\n    display: none;")
    expect(styles).toContain(".user-list-row__status-badge {\n    display: inline-flex;")
  })

  it('marks Vika accounts beside the name without sacrificing name truncation', () => {
    expect(page).toContain('v-if="member.isVika" class="user-list-row__vika-marker"')
    expect(page).toContain('aria-label="t(\'users.vikaAccount\')"')
    expect(page).toContain('<span aria-hidden="true">·</span><strong')
    expect(page).toContain('class="user-list-row__vika-letter">В</strong>')
    expect(styles).toContain('.user-list-row__name {\n  display: flex;\n  min-width: 0;\n  align-items: baseline;\n  flex-wrap: nowrap;\n  white-space: nowrap;')
    expect(styles).toContain('.user-list-row__name-text {\n  min-width: 0;\n  flex: 1 1 auto;')
    expect(styles).toContain('.user-list-row__vika-letter {\n  color: #b63843;\n  font-weight: 800;')
  })

  it('builds context-aware actions in the common menu', () => {
    expect(page).toContain("label: t('users.archiveAction'), icon: 'i-lucide-archive'")
    expect(page).toContain("label: t('users.vikaAccount'), icon: 'i-lucide-star', type: 'checkbox'")
    expect(page).toContain("label: resendLabel(member), icon: resendWait(member)")
    expect(page).toContain("if (member.status === 'archived')")
  })
})
