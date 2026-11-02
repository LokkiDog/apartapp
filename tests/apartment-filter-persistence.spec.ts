import { createRenderer, defineComponent, ref, type Ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useApartmentFilters } from '../src/pages/apartments/model/use-apartment-filters'
import { createApartmentFilters } from '../src/pages/apartments/model/apartment-filters'

type Actor = { id: string; organizationId: string }
const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {},
  parentNode: () => null, nextSibling: () => null, patchProp: () => {},
})
const mounted = new Set<{ unmount(): void }>()
function page(actor: Ref<Actor | null> = ref({ id: 'me', organizationId: 'north' })) {
  let state!: ReturnType<typeof useApartmentFilters>
  const app = renderer.createApp(defineComponent({
    setup() { state = useApartmentFilters(actor); return () => null },
  }))
  mounted.add(app)
  app.mount({})
  return { ...state, close() { app.unmount(); mounted.delete(app) } }
}
class StorageMemory {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}
afterEach(() => { mounted.forEach(app => app.unmount()); mounted.clear(); vi.unstubAllGlobals() })

describe('apartment list filter persistence', () => {
  it('restores all filters and search after leaving and reopening, and persists reset', () => {
    vi.stubGlobal('localStorage', new StorageMemory())
    const first = page()
    const selected = { onlyMine: true, hotelId: 'hotel', typeId: 'studio', status: 'active' as const, publication: 'published' as const }
    Object.assign(first.filters, selected)
    first.search.value = 'A12'
    first.close()
    const reopened = page()
    expect(reopened.filters).toEqual(selected)
    expect(reopened.search.value).toBe('A12')
    expect(reopened.activeFilterCount.value).toBe(5)
    reopened.resetFilters()
    expect(reopened.activeFilterCount.value).toBe(0)
    reopened.close()
    const afterReset = page()
    expect(afterReset.filters).toEqual(createApartmentFilters())
    expect(afterReset.search.value).toBe('A12')
  })

  it('restores after late authentication and isolates users and organizations', () => {
    vi.stubGlobal('localStorage', new StorageMemory())
    const first = page()
    first.filters.onlyMine = true
    first.filters.publication = 'unpublished'
    first.close()
    const actor = ref<Actor | null>(null)
    const restored = page(actor)
    expect(restored.filters.onlyMine).toBe(false)
    actor.value = { id: 'me', organizationId: 'north' }
    expect(restored.filters.onlyMine).toBe(true)
    expect(restored.filters.publication).toBe('unpublished')
    actor.value = { id: 'other', organizationId: 'north' }
    expect(restored.filters).toEqual(createApartmentFilters())
    restored.filters.hotelId = 'other-hotel'
    actor.value = { id: 'me', organizationId: 'south' }
    expect(restored.filters).toEqual(createApartmentFilters())
    actor.value = { id: 'me', organizationId: 'north' }
    expect(restored.filters.onlyMine).toBe(true)
    expect(restored.filters.hotelId).toBe('all')
    expect(restored.filters.publication).toBe('unpublished')
  })

  it('fills missing settings and keeps filters usable with corrupt or unavailable storage', () => {
    const storage = new StorageMemory()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('aparts.filters.v1:north:me:apartments', '{"onlyMine":true}')
    const migrated = page()
    expect(migrated.filters).toEqual({ ...createApartmentFilters(), onlyMine: true })
    migrated.close()
    for (const invalid of ['{', '{"onlyMine":"true"}', '{"publication":"removed"}']) {
      storage.setItem('aparts.filters.v1:north:me:apartments', invalid)
      const fallback = page()
      expect(fallback.filters).toEqual(createApartmentFilters())
      fallback.close()
    }
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') } })
    const unavailable = page()
    expect(() => { unavailable.filters.onlyMine = true }).not.toThrow()
    expect(unavailable.filters.onlyMine).toBe(true)
  })
})
