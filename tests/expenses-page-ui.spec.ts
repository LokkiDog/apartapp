import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('expenses page UI contracts', () => {
  it('opens an expense for editing from the list row', () => {
    const source = readFileSync('src/pages/expenses/ExpensesPage.vue', 'utf8')

    expect(source).toContain('role="button" tabindex="0" @click="openEdit(expense)"')
    expect(source).toContain('@keydown.enter="openEdit(expense)"')
    expect(source).toContain('@keydown.space.prevent="openEdit(expense)"')
    expect(source).toContain('@click="openEdit(expense)"')
    expect(source).toContain('@click.stop @keydown.stop')
    expect(source).not.toContain('<button type="button" class="-ml-2 flex min-h-[72px]')
  })
})
