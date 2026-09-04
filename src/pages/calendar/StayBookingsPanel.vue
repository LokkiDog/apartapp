<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { formatDate } from '#fsd/shared/lib'
import StayBookingRow from './StayBookingRow.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  stays: Stay[]
  title: string
  groupBy: 'date' | 'apartment'
  rowVariant: 'agenda' | 'apartment'
  canEdit: boolean
  canDelete: boolean
  emptyLabel?: string
  collapsible?: boolean
  warning?: boolean
}>()
const emit = defineEmits<{ open: [stay: Stay]; edit: [stay: Stay]; delete: [stay: Stay] }>()
const { t } = useI18n()

const groups = computed(() => {
  const grouped = new Map<string, { key: string; label: string; stays: Stay[] }>()
  for (const stay of props.stays) {
    const key = props.groupBy === 'date' ? stay.checkOutOn : stay.apartmentId
    const label = props.groupBy === 'date' ? formatDate(stay.checkOutOn) : `${stay.apartment.name} · ${stay.apartment.hotel.name}`
    const group = grouped.get(key) ?? { key, label, stays: [] }
    group.stays.push(stay)
    grouped.set(key, group)
  }
  return [...grouped.values()]
})

</script>

<template>
  <section class="stay-bookings-panel surface" :class="{ 'stay-bookings-panel--warning': warning }">
    <UCollapsible v-if="collapsible" :default-open="true">
      <template #default="{ open }">
        <button type="button" class="stay-bookings-panel__header stay-bookings-panel__header--toggle" :aria-label="title">
          <span class="stay-bookings-panel__title"><span>{{ title }}</span><span class="stay-bookings-panel__count">{{ stays.length }}</span></span>
          <UIcon name="i-lucide-chevron-down" class="stay-bookings-panel__chevron" :class="{ 'stay-bookings-panel__chevron--open': open }" aria-hidden="true" />
        </button>
      </template>
      <template #content>
        <div v-if="groups.length" class="stay-bookings-panel__groups">
          <section v-for="group in groups" :key="group.key" class="stay-bookings-panel__group">
            <h3 class="stay-bookings-panel__group-title">{{ group.label }}</h3>
            <div :class="rowVariant === 'agenda' ? 'stay-bookings-panel__agenda-items' : 'apartment-bookings__items'">
              <StayBookingRow v-for="stay in group.stays" :key="stay.id" :stay="stay" :variant="rowVariant" :can-edit="canEdit" :can-delete="canDelete" :can-manage-cleaning="canDelete" @open="emit('open', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" />
            </div>
          </section>
        </div>
        <p v-else class="stay-bookings-panel__empty">{{ emptyLabel ?? t('calendarExtra.noBookings') }}</p>
      </template>
    </UCollapsible>
    <template v-else>
      <header class="stay-bookings-panel__header">
        <h2>{{ title }}</h2>
        <span class="stay-bookings-panel__count">{{ stays.length }}</span>
      </header>
      <div v-if="groups.length" class="stay-bookings-panel__groups">
        <section v-for="group in groups" :key="group.key" class="stay-bookings-panel__group">
          <h3 class="stay-bookings-panel__group-title">{{ group.label }}</h3>
          <div :class="rowVariant === 'agenda' ? 'stay-bookings-panel__agenda-items' : 'apartment-bookings__items'">
            <StayBookingRow v-for="stay in group.stays" :key="stay.id" :stay="stay" :variant="rowVariant" :can-edit="canEdit" :can-delete="canDelete" :can-manage-cleaning="canDelete" @open="emit('open', $event)" @edit="emit('edit', $event)" @delete="emit('delete', $event)" />
          </div>
        </section>
      </div>
      <p v-else class="stay-bookings-panel__empty">{{ emptyLabel ?? t('calendarExtra.noBookings') }}</p>
    </template>
  </section>
</template>
