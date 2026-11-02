import { computed, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { z } from 'zod'
import { apartmentFiltersSchema, createApartmentFilters } from './apartment-filters'

type FilterActor = { id: string; organizationId: string }
const savedFiltersSchema = apartmentFiltersSchema.extend({ search: z.string().default('') })

export function useApartmentFilters(actor: Readonly<Ref<FilterActor | null | undefined>>) {
  const filters = reactive(createApartmentFilters())
  const search = ref('')
  const activeFilterCount = computed(() => Number(filters.onlyMine) + Number(filters.hotelId !== 'all')
    + Number(filters.typeId !== 'all') + Number(filters.status !== 'all') + Number(filters.publication !== 'all'))
  let storageKey: string | null = null
  let restoring = false

  onMounted(() => {
    watch(() => actor.value ? `${actor.value.organizationId}:${actor.value.id}` : null, identity => {
      restoring = true
      storageKey = identity ? `aparts.filters.v1:${identity}:apartments` : null
      let saved = savedFiltersSchema.parse({})
      try {
        const parsed = savedFiltersSchema.safeParse(JSON.parse(storageKey ? localStorage.getItem(storageKey) ?? 'null' : 'null'))
        if (parsed.success) saved = parsed.data
      } catch { /* Keep usable defaults if browser storage is unavailable. */ }
      const { search: savedSearch, ...savedFilters } = saved
      Object.assign(filters, savedFilters)
      search.value = savedSearch
      restoring = false
    }, { immediate: true, flush: 'sync' })
  })

  watch(() => ({ ...filters, search: search.value }), value => {
    if (!storageKey || restoring) return
    try { localStorage.setItem(storageKey, JSON.stringify(value)) }
    catch { /* Filters still work when storage is unavailable or full. */ }
  }, { flush: 'sync' })

  function resetFilters() { Object.assign(filters, createApartmentFilters()) }
  return { filters, search, activeFilterCount, resetFilters }
}
