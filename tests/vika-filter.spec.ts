import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Vika booking filter', () => {
  it('keeps one eligible Vika account per organization through an administrator-only endpoint', () => {
    const schema = readFileSync('server/infrastructure/database/schema.ts', 'utf8')
    const service = readFileSync('server/modules/auth/account.service.ts', 'utf8')
    const endpoint = readFileSync('server/api/users/[id]/vika.patch.ts', 'utf8')

    expect(schema).toContain("isVika: boolean('is_vika').notNull().default(false)")
    expect(schema).toContain("users_one_vika_per_organization_unique")
    expect(service).toContain('export async function setVikaUser')
    expect(service).toContain("requireRole(actor, 'administrator')")
    expect(service).toContain('isApartmentOwnerEligible(target.roles)')
    expect(service).toContain("eq(users.organizationId, actor.organizationId)")
    expect(service).toContain("action: isVika ? 'user.vika_assigned' : 'user.vika_cleared'")
    expect(endpoint).toContain("z.object({ isVika: z.boolean() })")
  })

  it('filters stays through the Vika apartment-manager assignment only for administrators', () => {
    const service = readFileSync('server/modules/stay/stay.service.ts', 'utf8')
    const page = readFileSync('src/pages/calendar/CalendarPage.vue', 'utf8')
    const users = readFileSync('src/pages/settings/UsersSettingsPage.vue', 'utf8')

    expect(service).toContain('if (query.onlyVika)')
    expect(service).toContain("requireRole(actor, 'administrator')")
    expect(service).toContain('.innerJoin(users, eq(apartmentManagers.userId, users.id))')
    expect(service).toContain('eq(users.isVika, true)')
    expect(page).toContain("onlyVika: true")
    expect(page).toContain("t('calendar.onlyVika')")
    expect(users).toContain("t('users.vikaAccount')")
    expect(users).toContain('vikaPendingId')
  })
})
