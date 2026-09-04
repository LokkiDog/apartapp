<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import StayCalendarPopover from './StayCalendarPopover.vue'
import type { CalendarEventMarker } from './model/calendar-event-markers'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  marker: CalendarEventMarker<Stay>
  showApartmentName?: boolean
  showGuestDetails?: boolean
  showFinancialDetails?: boolean
  canEdit?: boolean
  canManageCleaning?: boolean
}>(), {
  showApartmentName: false,
  showGuestDetails: false,
  showFinancialDetails: false,
  canEdit: false,
  canManageCleaning: false
})
const emit = defineEmits<{ edit: [stay: Stay] }>()
const { t } = useI18n()

const departureStyle = { backgroundColor: 'var(--calendar-departure-bg)', color: 'var(--calendar-departure-ink)', '--departure-color': 'var(--calendar-departure-ink)' }
const arrivalStyle = { backgroundColor: 'var(--calendar-arrival-bg)', color: 'var(--calendar-arrival-ink)', borderLeftColor: 'var(--calendar-arrival-ink)' }

function markerLabel(kind: 'departure' | 'arrival', stay: Stay) {
  const label = t(`calendar.${kind}`)
  return props.showApartmentName ? `${label} · ${stay.apartment.name}` : label
}
</script>

<template>
  <div
    class="calendar-event-marker"
    :class="{
      'calendar-event-marker--combined': marker.departureStay && marker.arrivalStay,
      'calendar-event-marker--single': !marker.departureStay || !marker.arrivalStay
    }"
  >
    <StayCalendarPopover
      v-if="marker.departureStay"
      :stay="marker.departureStay"
      context="departure"
      :left-label="markerLabel('departure', marker.departureStay)"
      event-class="calendar-event-marker__segment calendar-event-marker__segment--departure"
      :event-style="departureStyle"
      :show-guest-details="showGuestDetails"
      :show-financial-details="showFinancialDetails"
      :can-edit="canEdit"
      :can-manage-cleaning="canManageCleaning"
      @edit="emit('edit', $event)"
    />
    <StayCalendarPopover
      v-if="marker.arrivalStay"
      :stay="marker.arrivalStay"
      context="arrival"
      :left-label="markerLabel('arrival', marker.arrivalStay)"
      event-class="calendar-event-marker__segment calendar-event-marker__segment--arrival"
      :event-style="arrivalStyle"
      :show-guest-details="showGuestDetails"
      :show-financial-details="showFinancialDetails"
      :can-edit="canEdit"
      :can-manage-cleaning="canManageCleaning"
      @edit="emit('edit', $event)"
    />
  </div>
</template>
