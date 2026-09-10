<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import type { Hotel } from '#fsd/entities/hotel'
import { ApartmentSelect } from '#fsd/features/select-apartment'
import type { PropertyScope } from '../model/property-scope'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  hotels: Hotel[]
  apartments: Apartment[]
  apartmentsError?: boolean
  scopeLabel?: string
}>(), {
  apartmentsError: false,
  scopeLabel: undefined
})

const scope = defineModel<PropertyScope>('scope', { required: true })
const { t } = useI18n()
const scopeLabelText = computed(() => props.scopeLabel || t('reports.scope'))
const hotelId = defineModel<string>('hotelId', { required: true })
const apartmentIds = defineModel<string[]>('apartmentIds', { required: true })

const scopeOptions = computed(() => [
  { label: t('scope.all'), value: 'all' },
  { label: t('scope.hotel'), value: 'hotel' },
  { label: t('scope.apartments'), value: 'apartments' }
])
const hotelOptions = computed(() => [
  { label: t('scope.chooseHotel'), value: 'all' },
  ...props.hotels.filter(hotel => hotel.status === 'active').map(hotel => ({ label: hotel.name, value: hotel.id }))
])
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

function removeApartment(id: string) {
  apartmentIds.value = apartmentIds.value.filter(apartmentId => apartmentId !== id)
}
</script>

<template>
  <div class="property-scope-filter">
    <UFormField :label="scopeLabelText">
      <USelect v-model="scope" :items="scopeOptions" class="w-full" />
    </UFormField>

    <UFormField v-if="scope === 'hotel'" :label="t('scope.hotelLabel')">
      <USelect v-model="hotelId" :items="hotelOptions" class="w-full" />
    </UFormField>

    <UFormField v-else-if="scope === 'apartments'" :label="t('scope.apartmentsLabel')">
      <UAlert v-if="apartmentsError" color="error" variant="soft" :title="t('scope.loadError')" :description="t('scope.loadErrorDescription')" />
      <ApartmentSelect
        v-model="apartmentIds"
        :apartments="apartments"
        multiple
        clear
        :placeholder="t('scope.chooseApartments')"
        class="property-scope-filter__apartment-select w-full"
      />
      <div v-if="selectedApartments.length" class="property-scope-filter__selected">
        <span v-for="apartment in selectedApartments" :key="apartment.id" class="property-scope-filter__selected-item">
          <span class="min-w-0"><span class="block truncate font-medium">{{ apartment.name }}</span><span class="block truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}<span v-if="apartment.status === 'archived'"> · {{ t('scope.archived') }}</span></span></span>
          <button type="button" :aria-label="`${t('scope.remove')} ${apartment.name}`" @click="removeApartment(apartment.id)"><UIcon name="i-lucide-x" class="size-4" /></button>
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
