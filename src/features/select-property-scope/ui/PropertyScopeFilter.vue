<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import type { Hotel } from '#fsd/entities/hotel'
import type { PropertyScope } from '../model/property-scope'

const props = withDefaults(defineProps<{
  hotels: Hotel[]
  apartments: Apartment[]
  apartmentsError?: boolean
  scopeLabel?: string
}>(), {
  apartmentsError: false,
  scopeLabel: 'Область'
})

const scope = defineModel<PropertyScope>('scope', { required: true })
const hotelId = defineModel<string>('hotelId', { required: true })
const apartmentIds = defineModel<string[]>('apartmentIds', { required: true })

const scopeOptions = [
  { label: 'Все объекты', value: 'all' },
  { label: 'Один отель', value: 'hotel' },
  { label: 'Выбранные апартаменты', value: 'apartments' }
]
const hotelOptions = computed(() => [
  { label: 'Выберите отель', value: 'all' },
  ...props.hotels.filter(hotel => hotel.status === 'active').map(hotel => ({ label: hotel.name, value: hotel.id }))
])
const apartmentItems = computed(() => {
  const byHotel = new Map<string, Apartment[]>()
  const sorted = [...props.apartments].sort((left, right) => left.hotel.name.localeCompare(right.hotel.name, 'ru') || left.name.localeCompare(right.name, 'ru'))
  for (const apartment of sorted) {
    const list = byHotel.get(apartment.hotel.id) ?? []
    list.push(apartment)
    byHotel.set(apartment.hotel.id, list)
  }
  return [...byHotel.values()].flatMap(group => [
    { type: 'label' as const, label: group[0]?.hotel.name ?? '', value: group[0]?.hotel.id ?? '' },
    ...group.map(apartment => ({
      label: apartment.name,
      value: apartment.id,
      description: `${apartment.hotel.name} · ${apartment.internalCode}${apartment.status === 'archived' ? ' · Архив' : ''}`,
      status: apartment.status
    }))
  ])
})
const selectedApartments = computed(() => props.apartments.filter(apartment => apartmentIds.value.includes(apartment.id)))

watch(scope, value => {
  if (value === 'all') {
    hotelId.value = 'all'
    apartmentIds.value = []
  } else if (value === 'hotel') {
    hotelId.value = 'all'
    apartmentIds.value = []
  } else {
    hotelId.value = 'all'
  }
})

function plural(value: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(value) % 100
  const mod10 = mod100 % 10
  return mod100 >= 11 && mod100 <= 19 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many
}
function selectedCountLabel(value: number) {
  return value === 1 ? 'Выбран 1 апартамент' : `Выбрано ${value} ${plural(value, 'апартамент', 'апартамента', 'апартаментов')}`
}
function removeApartment(id: string) {
  apartmentIds.value = apartmentIds.value.filter(apartmentId => apartmentId !== id)
}
</script>

<template>
  <div class="property-scope-filter">
    <UFormField :label="scopeLabel">
      <USelect v-model="scope" :items="scopeOptions" class="w-full" />
    </UFormField>

    <UFormField v-if="scope === 'hotel'" label="Апарт-отель">
      <USelect v-model="hotelId" :items="hotelOptions" class="w-full" />
    </UFormField>

    <UFormField v-else-if="scope === 'apartments'" label="Апартаменты">
      <UAlert v-if="apartmentsError" color="error" variant="soft" title="Не удалось загрузить апартаменты" description="Обновите страницу или проверьте доступ к разделу апартаментов." />
      <USelectMenu
        v-model="apartmentIds"
        :items="apartmentItems"
        value-key="value"
        multiple
        clear
        size="md"
        color="neutral"
        variant="outline"
        :content="{ align: 'start', sideOffset: 8, collisionPadding: 8 }"
        :search-input="{ placeholder: 'Поиск апартамента', variant: 'none', ui: { root: 'h-10 min-h-0 self-stretch', base: 'h-10 min-h-0 border-0 px-3 py-0 text-sm font-medium text-[var(--color-ink)] ring-0 focus:ring-0 focus-visible:ring-0' } }"
        :ui="{ base: 'w-full h-11 min-h-11 rounded-[10px] bg-white text-[var(--color-ink)] ring-[var(--color-line)] hover:bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]', input: 'h-11 min-h-0 border-0 bg-white text-[var(--color-ink)]', content: 'rounded-[12px] bg-white p-2 shadow-[var(--shadow-overlay)] ring-1 ring-[var(--color-line)]' }"
        class="property-scope-filter__apartment-select w-full"
      >
        <template #default="{ modelValue }">
          <span v-if="modelValue?.length">{{ selectedCountLabel(modelValue.length) }}</span>
          <span v-else class="text-[var(--color-muted)]">Выберите апартаменты</span>
        </template>
      </USelectMenu>
      <div v-if="selectedApartments.length" class="property-scope-filter__selected">
        <span v-for="apartment in selectedApartments" :key="apartment.id" class="property-scope-filter__selected-item">
          <span class="min-w-0"><span class="block truncate font-medium">{{ apartment.name }}</span><span class="block truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}<span v-if="apartment.status === 'archived'"> · Архив</span></span></span>
          <button type="button" :aria-label="`Убрать апартамент ${apartment.name}`" @click="removeApartment(apartment.id)"><UIcon name="i-lucide-x" class="size-4" /></button>
        </span>
      </div>
    </UFormField>
  </div>
</template>

<style scoped>
.property-scope-filter { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; }
.property-scope-filter > * { min-width: 0; }
.property-scope-filter__apartment-select { min-width: 0; }
.property-scope-filter__apartment-select > button { width: 100%; min-width: 0; }
.property-scope-filter__selected { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .625rem; }
.property-scope-filter__selected-item { display: inline-flex; min-height: 44px; max-width: 100%; align-items: center; gap: .625rem; border-radius: 10px; background: var(--color-primary-soft); padding: .4rem .4rem .4rem .75rem; color: var(--color-ink); }
.property-scope-filter__selected-item > span { min-width: 0; }
.property-scope-filter__selected-item button { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 8px; color: var(--color-muted); transition-property: background-color, color, scale; transition-duration: 150ms; }
.property-scope-filter__selected-item button:hover { background: rgba(35, 112, 91, .12); color: var(--color-primary-strong); }
.property-scope-filter__selected-item button:active { scale: .96; }
@media (max-width: 639px) {
  .property-scope-filter { grid-template-columns: minmax(0, 1fr); }
}
</style>
