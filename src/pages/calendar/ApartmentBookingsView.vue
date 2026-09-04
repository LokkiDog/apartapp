<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import StayBookingRow from './StayBookingRow.vue'
import { bookingsForApartment } from './model/calendar-view'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  apartments: Apartment[]
  stays: Stay[]
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ open: [stay: Stay]; edit: [stay: Stay]; delete: [stay: Stay] }>()
const { t } = useI18n()

const groups = computed(() => props.apartments.map(apartment => ({
  apartment,
  stays: bookingsForApartment(props.stays, apartment.id)
})))

</script>

<template>
  <div v-if="groups.length" class="apartment-bookings">
    <UCollapsible v-for="group in groups" :key="group.apartment.id" as="section" :default-open="Boolean(group.stays.length)" class="apartment-bookings__group surface">
      <template #default="{ open }">
        <button type="button" class="apartment-bookings__header">
          <span class="min-w-0"><span class="block truncate font-semibold">{{ group.apartment.name }}</span><span class="block truncate text-xs text-[var(--color-muted)]">{{ group.apartment.hotel.name }}</span></span>
          <span class="apartment-bookings__header-side"><span class="apartment-bookings__count">{{ group.stays.length }}</span><UIcon name="i-lucide-chevron-down" class="apartment-bookings__chevron" :class="{ 'apartment-bookings__chevron--open': open }" /></span>
        </button>
      </template>
      <template #content>
        <div v-if="group.stays.length" class="apartment-bookings__items">
          <StayBookingRow v-for="stay in group.stays" :key="stay.id" :stay="stay" variant="apartment" :can-edit="canEdit" :can-delete="canDelete" :can-manage-cleaning="canDelete" @open="emit('open', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" />
        </div>
        <p v-else class="apartment-bookings__empty">{{ t('calendarExtra.noBookings') }}</p>
      </template>
    </UCollapsible>
  </div>
</template>
