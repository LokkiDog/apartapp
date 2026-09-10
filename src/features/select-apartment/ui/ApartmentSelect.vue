<script setup lang="ts" generic="TValue extends string | string[] = string">
import type { Apartment } from '#fsd/entities/apartment'
import { apartmentSearchText } from '../model/apartment-search'
import { useI18n } from 'vue-i18n'

type ApartmentChoice = Pick<Apartment, 'id' | 'name'> & { hotel: Pick<Apartment['hotel'], 'name'>, status?: Apartment['status'] }
type ExtraItem = { label: string, value: string }

const modelValue = defineModel<TValue>({ required: true })
const props = withDefaults(defineProps<{
  apartments: ApartmentChoice[]
  prependItems?: ExtraItem[]
  disabled?: boolean
  multiple?: boolean
  clear?: boolean
  placeholder?: string
}>(), {
  prependItems: () => [],
  disabled: false,
  multiple: false,
  clear: false,
  placeholder: undefined
})
const { t, locale } = useI18n()

const collator = computed(() => new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' }))

const items = computed(() => {
  const apartmentsByHotel = new Map<string, ApartmentChoice[]>()
  const sortedApartments = [...props.apartments].sort((left, right) =>
    collator.value.compare(left.hotel.name, right.hotel.name)
    || collator.value.compare(left.name, right.name)
  )

  for (const apartment of sortedApartments) {
    const hotelApartments = apartmentsByHotel.get(apartment.hotel.name) ?? []
    hotelApartments.push(apartment)
    apartmentsByHotel.set(apartment.hotel.name, hotelApartments)
  }

  const apartmentGroups = [...apartmentsByHotel.entries()].map(([hotelName, apartments]) => [
    { type: 'label' as const, label: hotelName, value: `hotel:${hotelName}`, search: hotelName },
    ...apartments.map(apartment => ({
      label: apartment.name,
      value: apartment.id,
      search: apartmentSearchText({ name: apartment.name, hotelName: apartment.hotel.name }),
      description: apartment.status === 'archived' ? t('scope.archived') : undefined
    }))
  ])
  const prependGroup = props.prependItems.map(item => ({ ...item, search: item.label }))

  return prependGroup.length ? [prependGroup, ...apartmentGroups] : apartmentGroups
})

function selectedLabel(value: unknown) {
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    return value.length === 1 ? t('scope.selectedOne') : t('scope.selectedMany', { count: value.length })
  }
  if (typeof value !== 'string') return ''
  const prependItem = props.prependItems.find(item => item.value === value)
  if (prependItem) return prependItem.label
  const apartment = props.apartments.find(item => item.id === value)
  return apartment?.name ?? ''
}
</script>

<template>
  <USelectMenu
    v-model="modelValue"
    :items="items"
    value-key="value"
    :disabled="disabled"
    :multiple="multiple"
    :clear="clear"
    :filter-fields="['label', 'search']"
    :search-input="{ placeholder: t('common.searchApartment'), variant: 'none', ui: { root: 'm-2 w-auto self-stretch', base: 'h-10 min-h-0 border-0 px-3 py-0 text-sm ring-0 focus:ring-0 focus-visible:ring-0' } }"
    :content="{ align: 'start', sideOffset: 8, collisionPadding: 8, bodyLock: true }"
    :ui="{ base: 'w-full min-h-11 rounded-[10px]', value: 'w-full min-w-0 text-start', placeholder: 'w-full min-w-0 text-start', content: 'apartment-select-menu rounded-[12px]', viewport: 'min-h-0 overflow-y-auto overscroll-contain', label: 'sticky top-0 z-[1] bg-default px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted)]', item: 'min-h-10 items-center px-2.5 py-1.5' }"
    class="w-full"
  >
    <template #default="{ modelValue: selectedValue }">
      <span class="pointer-events-none w-full min-w-0 truncate text-start" :class="{ 'text-[var(--color-muted)]': !selectedLabel(selectedValue) }">{{ selectedLabel(selectedValue) || placeholder || '\u00a0' }}</span>
    </template>
    <template #empty><span class="block px-3 py-2 text-sm text-[var(--color-muted)]">{{ t('common.noApartmentsFound') }}</span></template>
  </USelectMenu>
</template>

<style>
.apartment-select-menu {
  max-height: min(18rem, calc(100dvh - 1rem), var(--reka-combobox-content-available-height, 18rem));
}
.apartment-select-menu [data-slot="viewport"] {
  overscroll-behavior: contain;
}
</style>
