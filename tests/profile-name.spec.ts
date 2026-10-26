import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useProfileName } from '../src/pages/account/model/profile-name'
import { profileUpdateSchema } from '../shared/contracts/platform'

describe('profile editing', () => {
  it('hydrates after login, preserves unsaved input during refresh and resets on account changes', async () => {
    const scope = effectScope()
    const user = ref<{ id: string; name: string } | null>(null)
    const editor = scope.run(() => useProfileName(user))!
    user.value = { id: 'a', name: 'Anna' }
    expect(editor.form.name).toBe('Anna')
    editor.form.name = 'Anna Maria'
    user.value = { id: 'a', name: 'Anne' }
    await nextTick()
    expect(editor.form.name).toBe('Anna Maria')
    expect(editor.changed.value).toBe(true)
    editor.accept('Anna Maria')
    expect(editor.changed.value).toBe(false)
    user.value = { id: 'b', name: 'Boris' }
    expect(editor.form.name).toBe('Boris')
    user.value = null
    expect(editor.form.name).toBe('')
    scope.stop()
  })
  it('updates pristine fields with the session and ignores surrounding whitespace for changes', () => {
    const scope = effectScope()
    const user = ref({ id: 'a', name: 'Anna' })
    const editor = scope.run(() => useProfileName(user))!
    user.value = { id: 'a', name: 'Anne' }
    expect(editor.form.name).toBe('Anne')
    editor.form.name = ' Anne '
    expect(editor.changed.value).toBe(false)
    scope.stop()
  })
  it('normalizes names and rejects invalid lengths and protected account fields', () => {
    expect(profileUpdateSchema.parse({ name: '  Anna Maria  ' })).toEqual({ name: 'Anna Maria' })
    for (const name of ['', '   ', 'A', 'x'.repeat(201)]) expect(profileUpdateSchema.safeParse({ name }).success).toBe(false)
    for (const key of ['userId', 'organizationId', 'email', 'roles']) expect(profileUpdateSchema.safeParse({ name: 'Anna', [key]: 'foreign' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ name: 'x'.repeat(200) }).success).toBe(true)
  })
})
