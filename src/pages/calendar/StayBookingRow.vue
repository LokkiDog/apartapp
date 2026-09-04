<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Stay } from '#fsd/entities/stay'
import { formatDate, formatEuro, getFormatLocale } from '#fsd/shared/lib'
import StayServiceIcons from './StayServiceIcons.vue'
import { stayCleaningHref, stayCleaningPresentation } from './model/stay-cleaning'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  stay: Stay
  variant: 'agenda' | 'apartment'
  canEdit: boolean
  canDelete: boolean
  canManageCleaning: boolean
}>()
const emit = defineEmits<{ open: [stay: Stay]; edit: [stay: Stay]; delete: [stay: Stay] }>()
const { t } = useI18n()

function guestBreakdownLabel(stay: Stay) {
  const adults = `${t('calendar.adults')}: ${stay.adultCount}`
  return stay.childCount > 0 ? `${adults} · ${t('calendar.children')}: ${stay.childCount}` : adults
}

function compactDate(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Sofia' }).format(new Date(`${value}T12:00:00Z`))
}

function commentLabel(stay: Stay) {
  return stay.guestComment?.trim() ?? ''
}

function cashLabel(stay: Stay) {
  return typeof stay.cashAmountEur === 'number' && stay.cashAmountEur > 0 ? `${t('calendarExtra.cashShort')}: ${formatEuro(stay.cashAmountEur)}` : ''
}

function menuItems(stay: Stay): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (props.canEdit) items.push({ label: t('calendar.editBooking'), icon: 'i-lucide-pencil', onSelect: () => emit('edit', stay) })
  if (props.canDelete) items.push({ label: t('calendar.deleteBooking'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', stay) })
  return items.length ? [items] : []
}
</script>

<template>
  <article v-if="variant === 'agenda'" class="stay-agenda-item">
    <button type="button" class="booking-row-open" :aria-label="t('calendarExtra.openBooking', { apartment: stay.apartment.name })" @click="emit('open', stay)" />
    <div class="stay-agenda-item__content">
      <div class="stay-agenda-item__title-row">
        <p class="stay-agenda-item__apartment">{{ stay.apartment.name }} <span>· {{ stay.apartment.hotel.name }}</span></p>
        <span class="stay-agenda-item__title-meta"><span class="stay-agenda-item__guest-count">{{ guestBreakdownLabel(stay) }}</span><StayServiceIcons :services="stay.services" /></span>
      </div>
      <p class="stay-agenda-item__meta">
        <span class="stay-agenda-item__guest-details">{{ guestBreakdownLabel(stay) }}</span>
        <span v-if="stay.guestName" class="stay-agenda-item__guest-name">{{ stay.guestName }}</span>
        <span class="stay-agenda-item__dates">{{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</span>
      </p>
    </div>
    <div class="stay-agenda-item__actions">
      <NuxtLink v-if="canManageCleaning" :to="stayCleaningHref(stay)" class="stay-cleaning-indicator" :class="stayCleaningPresentation(stay, t).className" :title="stayCleaningPresentation(stay, t).label" :aria-label="stayCleaningPresentation(stay, t).label"><UIcon :name="stayCleaningPresentation(stay, t).icon" class="size-4" /></NuxtLink>
      <UDropdownMenu v-if="menuItems(stay).length" :items="menuItems(stay)" :content="{ align: 'end' }" :modal="false"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="`${t('calendar.editBooking')} ${stay.apartment.name}`" class="stay-agenda-action active:scale-[0.96] transition-transform" /></UDropdownMenu>
    </div>
  </article>

  <article v-else class="apartment-bookings__item">
    <button type="button" class="booking-row-open" :aria-label="t('calendarExtra.openBooking', { apartment: stay.apartment.name })" @click="emit('open', stay)" />
    <div class="apartment-bookings__item-content">
      <div class="apartment-bookings__item-title">
        <span class="apartment-bookings__booking-dates"><span class="apartment-bookings__booking-dates-full">{{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</span><span class="apartment-bookings__booking-dates-compact">{{ compactDate(stay.checkInOn) }} → {{ compactDate(stay.checkOutOn) }}</span></span>
        <span class="apartment-bookings__item-meta"><span class="apartment-bookings__guest-count">{{ guestBreakdownLabel(stay) }}</span><StayServiceIcons :services="stay.services" /></span>
      </div>
      <p v-if="commentLabel(stay) || cashLabel(stay)" class="apartment-bookings__details">
        <span v-if="commentLabel(stay)" class="apartment-bookings__comment">{{ commentLabel(stay) }}</span>
        <span v-if="commentLabel(stay) && cashLabel(stay)" class="apartment-bookings__separator" aria-hidden="true">·</span>
        <span v-if="cashLabel(stay)" class="apartment-bookings__cash">{{ cashLabel(stay) }}</span>
      </p>
    </div>
    <div class="apartment-bookings__actions">
      <NuxtLink v-if="canManageCleaning" :to="stayCleaningHref(stay)" class="stay-cleaning-indicator" :class="stayCleaningPresentation(stay, t).className" :title="stayCleaningPresentation(stay, t).label" :aria-label="stayCleaningPresentation(stay, t).label"><UIcon :name="stayCleaningPresentation(stay, t).icon" class="size-4" /></NuxtLink>
      <UDropdownMenu v-if="menuItems(stay).length" :items="menuItems(stay)" :content="{ align: 'end' }" :modal="false"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="`${t('calendarExtra.bookingActions')}: ${stay.apartment.name}`" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu>
    </div>
  </article>
</template>
