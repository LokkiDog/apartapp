<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import { formatDate, formatEuro, getFormatLocale } from '#fsd/shared/lib'
import StayServiceIcons from './StayServiceIcons.vue'
import { bookingsForApartment } from './model/calendar-view'
import { stayCleaningHref, stayCleaningPresentation } from './model/stay-cleaning'
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

function guestLabel(stay: Stay) {
  const count = stay.adultCount + stay.childCount
  return t('calendarExtra.guestsCount', { count })
}

function compactDate(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Europe/Sofia'
  }).format(new Date(`${value}T12:00:00Z`))
}

function commentLabel(stay: Stay) {
  return stay.guestComment?.trim() ?? ''
}

function cashLabel(stay: Stay) {
  return typeof stay.cashAmountEur === 'number' && stay.cashAmountEur > 0
    ? `${t('calendarExtra.cashShort')}: ${formatEuro(stay.cashAmountEur)}`
    : ''
}

function hasDetails(stay: Stay) {
  return Boolean(commentLabel(stay) || cashLabel(stay))
}

function menuItems(stay: Stay): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (props.canEdit) items.push({ label: t('calendar.editBooking'), icon: 'i-lucide-pencil', onSelect: () => emit('edit', stay) })
  if (props.canDelete) items.push({ label: t('calendar.deleteBooking'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', stay) })
  return items.length ? [items] : []
}
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
          <article v-for="stay in group.stays" :key="stay.id" class="apartment-bookings__item">
            <button type="button" class="booking-row-open" :aria-label="t('calendarExtra.openBooking', { apartment: stay.apartment.name })" @click="emit('open', stay)" />
            <div class="apartment-bookings__item-content">
              <div class="apartment-bookings__item-title">
                <span class="apartment-bookings__booking-dates">
                  <span class="apartment-bookings__booking-dates-full">{{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</span>
                  <span class="apartment-bookings__booking-dates-compact">{{ compactDate(stay.checkInOn) }} → {{ compactDate(stay.checkOutOn) }}</span>
                </span>
                <span class="apartment-bookings__item-meta">
                  <span class="apartment-bookings__guest-count">{{ guestLabel(stay) }}</span>
                  <StayServiceIcons :services="stay.services" />
                </span>
              </div>
              <p v-if="hasDetails(stay)" class="apartment-bookings__details">
                <span v-if="commentLabel(stay)" class="apartment-bookings__comment">{{ commentLabel(stay) }}</span>
                <span v-if="commentLabel(stay) && cashLabel(stay)" class="apartment-bookings__separator" aria-hidden="true">·</span>
                <span v-if="cashLabel(stay)" class="apartment-bookings__cash">{{ cashLabel(stay) }}</span>
              </p>
            </div>
            <div class="apartment-bookings__actions">
              <NuxtLink v-if="canDelete && stay.cleaning?.id" :to="stayCleaningHref(stay)" class="stay-cleaning-indicator" :class="stayCleaningPresentation(stay, t).className" :title="stayCleaningPresentation(stay, t).label" :aria-label="stayCleaningPresentation(stay, t).label"><UIcon :name="stayCleaningPresentation(stay, t).icon" class="size-4" /></NuxtLink>
              <UDropdownMenu v-if="menuItems(stay).length" :items="menuItems(stay)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="`${t('calendarExtra.bookingActions')}: ${stay.apartment.name}`" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu>
            </div>
          </article>
        </div>
        <p v-else class="apartment-bookings__empty">{{ t('calendarExtra.noBookings') }}</p>
      </template>
    </UCollapsible>
  </div>
</template>
