<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import StayServiceIcons from './StayServiceIcons.vue'
import { stayCleaningHref, stayCleaningPresentation } from './model/stay-cleaning'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
  stay: Stay | null
  canEdit: boolean
  canManageCleaning: boolean
  showServicePrices: boolean
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; edit: [stay: Stay] }>()
const { t } = useI18n()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

function editStay() {
  if (!props.stay) return
  isOpen.value = false
  emit('edit', props.stay)
}
</script>

<template>
  <USlideover v-model:open="isOpen" :title="t('calendarExtra.bookingDetails')" :modal="true" :overlay="true">
    <template #body>
      <article v-if="stay" class="stay-details">
        <header class="stay-details__header">
          <span class="stay-details__icon"><UIcon name="i-lucide-calendar-range" class="size-5" /></span>
          <div class="min-w-0">
            <h3 class="truncate font-bold">{{ stay.apartment.name }}</h3>
            <p class="truncate text-sm text-[var(--color-muted)]">{{ stay.apartment.hotel.name }}</p>
          </div>
        </header>

        <dl class="stay-details__facts">
          <div><dt>{{ t('calendar.arrival') }}</dt><dd>{{ formatDate(stay.checkInOn) }}</dd></div>
          <div><dt>{{ t('calendar.departure') }}</dt><dd>{{ formatDate(stay.checkOutOn) }}</dd></div>
          <div><dt>{{ t('calendar.adults') }}</dt><dd>{{ stay.adultCount }}</dd></div>
          <div><dt>{{ t('calendar.children') }}</dt><dd>{{ stay.childCount }}</dd></div>
        </dl>

        <section v-if="stay.guestName || stay.guestPhone || stay.guestComment || stay.specialRequests" class="stay-details__section">
          <h3>{{ t('calendarExtra.guestDetails') }}</h3>
          <dl class="stay-details__list">
            <div v-if="stay.guestName"><dt>{{ t('calendarExtra.guestName') }}</dt><dd>{{ stay.guestName }}</dd></div>
            <div v-if="stay.guestPhone"><dt>{{ t('common.phone') }}</dt><dd>{{ stay.guestPhone }}</dd></div>
            <div v-if="stay.guestComment"><dt>{{ t('calendar.guestComment') }}</dt><dd>{{ stay.guestComment }}</dd></div>
            <div v-if="stay.specialRequests"><dt>{{ t('common.notes') }}</dt><dd>{{ stay.specialRequests }}</dd></div>
          </dl>
        </section>

        <section v-if="stay.services?.length" class="stay-details__section">
          <h3>{{ t('calendar.extraServices') }}</h3>
          <div class="stay-details__services">
            <div v-for="service in stay.services" :key="service.id" class="stay-details__service">
              <span class="flex min-w-0 items-center gap-2"><StayServiceIcons :services="[service]" /><span class="truncate">{{ service.nameSnapshot }}</span></span>
              <strong v-if="showServicePrices">{{ formatEuro(service.priceEurSnapshot) }}</strong>
            </div>
          </div>
        </section>

        <section v-if="stay.cashAmountEur !== null && stay.cashAmountEur !== undefined" class="stay-details__section stay-details__cash">
          <span>{{ t('calendar.cash') }}</span><strong>{{ formatEuro(stay.cashAmountEur) }}</strong>
        </section>

        <NuxtLink
          v-if="canManageCleaning && stay.cleaning?.id"
          :to="stayCleaningHref(stay)"
          class="stay-details__cleaning"
          :class="stayCleaningPresentation(stay, t).className"
        >
          <UIcon :name="stayCleaningPresentation(stay, t).icon" class="size-4" />
          <span>{{ stayCleaningPresentation(stay, t).label }}</span>
          <UIcon name="i-lucide-chevron-right" class="ml-auto size-4" />
        </NuxtLink>
      </article>
    </template>

    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">{{ t('common.close') }}</UButton>
        <UButton v-if="canEdit" icon="i-lucide-pencil" @click="editStay">{{ t('calendar.editBooking') }}</UButton>
      </div>
    </template>
  </USlideover>
</template>
