import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function localeValue(locale: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, locale)
}

describe('user archive and restoration contracts', () => {
  it('keeps archive reversible and restores users through an administrator-only endpoint', () => {
    const service = readFileSync('server/modules/auth/account.service.ts', 'utf8')
    const endpoint = readFileSync('server/api/users/[id]/restore.post.ts', 'utf8')
    const archiveBody = service.slice(service.indexOf('export async function archiveUser'), service.indexOf('export async function restoreUser'))

    expect(archiveBody).toContain("await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt)))")
    expect(archiveBody).toContain("await tx.update(users).set({ status: 'archived', updatedAt: new Date() }).where(eq(users.id, userId))")
    expect(archiveBody).not.toContain('deleteAssignedWork')
    expect(archiveBody).not.toContain('apartmentManagers')
    expect(archiveBody).toContain("publishNotification(userId, { type: 'session.revoked', reason: 'archived' })")
    expect(service).toContain('export async function restoreUser(actor: Actor, userId: string)')
    expect(service).toContain("requireRole(actor, 'administrator')")
    expect(service).toContain('eq(users.organizationId, actor.organizationId)')
    expect(service).toContain("if (user.status !== 'archived') throw createError({ statusCode: 409")
    expect(service).toContain("await db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, userId))")
    expect(service).toContain("action: 'user.restored'")
    expect(endpoint).toContain('restoreUser(await requireActor(event)')
  })

  it('does not let archived accounts reactivate through password links', () => {
    const service = readFileSync('server/modules/auth/account.service.ts', 'utf8')

    expect(service).toContain("if (!user || user.status !== 'active') return")
    expect(service).toContain("const expectedStatus = usedToken.type === 'invitation' ? 'invited' : 'active'")
    expect(service).toContain('eq(users.status, expectedStatus)')
  })

  it('offers restore only in the archived list and handles session revocation', () => {
    const page = readFileSync('src/pages/settings/UsersSettingsPage.vue', 'utf8')
    const realtime = readFileSync('app/plugins/notifications-realtime.client.ts', 'utf8')

    expect(page).toContain('async function restore(member: Member)')
    expect(page).toContain("/api/users/${member.id}/restore")
    expect(page).toContain("v-else><UButton color=\"neutral\" variant=\"ghost\" icon=\"i-lucide-archive-restore\"")
    expect(realtime).toContain("if (message.type === 'session.revoked')")
    expect(realtime).toContain("await $fetch('/api/auth/me')")
    expect(realtime).toContain("await navigateTo('/login?reason=archived')")
  })

  it('localizes restoration and the forced logout notice in every locale', () => {
    const locales = ['ru', 'en', 'he'].map(locale => JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8')) as Record<string, unknown>)

    for (const locale of locales) {
      expect(localeValue(locale, 'users.restoreAction')).toEqual(expect.any(String))
      expect(localeValue(locale, 'auth.archivedNotice')).toEqual(expect.any(String))
    }
  })
})
