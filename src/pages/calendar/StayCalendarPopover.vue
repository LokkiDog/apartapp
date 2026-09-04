<script lang="ts">
import { shallowRef } from 'vue'

const activeOwner = shallowRef<symbol | null>(null)
</script>

<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { stayCleaningPresentation } from './model/stay-cleaning'
import StayServiceIcons from './StayServiceIcons.vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  stay: Stay
  context: 'arrival' | 'stay' | 'departure'
  leftLabel?: string
  rightLabel?: string
  eventClass: string
  eventStyle?: Record<string, string>
  continuesLeft?: boolean
  continuesRight?: boolean
  showGuestDetails?: boolean
  showFinancialDetails?: boolean
  canEdit?: boolean
  canManageCleaning?: boolean
}>(), {
  leftLabel: '',
  rightLabel: '',
  eventStyle: undefined,
  continuesLeft: false,
  continuesRight: false,
  showGuestDetails: false,
  showFinancialDetails: false,
  canEdit: false,
  canManageCleaning: false
})
const emit = defineEmits<{ edit: [stay: Stay] }>()
const { t } = useI18n()

const owner = Symbol('stay-calendar-popover')
const isOpen = computed({
  get: () => activeOwner.value === owner,
  set: value => { activeOwner.value = value ? owner : (activeOwner.value === owner ? null : activeOwner.value) }
})

const contextLabel = computed(() => ({ arrival: t('calendar.arrival'), stay: t('calendar.stays'), departure: t('calendar.departure') })[props.context])
const hasCleaning = computed(() => Boolean(props.stay.cleaning?.id))
const cleaningPresentation = computed(() => stayCleaningPresentation(props.stay, t))
const nights = computed(() => Math.max(0, Math.round((Date.parse(`${props.stay.checkOutOn}T12:00:00Z`) - Date.parse(`${props.stay.checkInOn}T12:00:00Z`)) / 86400000)))
const guestCount = computed(() => props.stay.adultCount + props.stay.childCount)
const servicesLabel = computed(() => props.stay.services?.map(service => service.nameSnapshot).join(', ') ?? '')

function editStay() {
  isOpen.value = false
  emit('edit', props.stay)
}
</script>

<template>
  <UPopover v-model:open="isOpen" :content="{ sideOffset: 8, collisionPadding: 8 }">
    <template #default>
      <button
        type="button"
        class="stay-calendar-trigger"
        :class="[
          eventClass,
          {
            'stay-calendar-trigger--straight-left': continuesLeft,
            'stay-calendar-trigger--straight-right': continuesRight
          }
        ]"
        :style="eventStyle"
        :aria-label="`${contextLabel}: ${stay.apartment.name}, ${formatDate(stay.checkInOn)} — ${formatDate(stay.checkOutOn)}${servicesLabel ? `. ${t('calendar.extraServices')}: ${servicesLabel}` : ''}${canManageCleaning ? `. ${cleaningPresentation.label}` : ''}`"
      >
        <span v-if="continuesLeft" class="stay-calendar-trigger__arrow stay-calendar-trigger__arrow--left" aria-hidden="true" />
        <span v-if="leftLabel" class="stay-calendar-trigger__left">{{ leftLabel }}</span>
        <span v-if="rightLabel" class="stay-calendar-trigger__right">{{ rightLabel }}</span>
        <span v-if="canManageCleaning" class="stay-cleaning-marker" :class="cleaningPresentation.className" :title="cleaningPresentation.label" aria-hidden="true"><UIcon :name="cleaningPresentation.icon" class="size-3" /></span>
        <StayServiceIcons :services="stay.services" />
        <span v-if="continuesRight" class="stay-calendar-trigger__arrow stay-calendar-trigger__arrow--right" aria-hidden="true" />
      </button>
    </template>

    <template #content>
      <article class="stay-calendar-popover">
        <div class="stay-calendar-popover__accent" :style="{ backgroundColor: eventStyle?.backgroundColor }" />
        <div class="stay-calendar-popover__body">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="stay-calendar-popover__context">{{ contextLabel }}</p>
              <h3 class="truncate text-sm font-bold text-[var(--color-ink)]">{{ stay.apartment.name }}</h3>
              <p class="truncate text-xs text-[var(--color-muted)]">{{ stay.apartment.hotel.name }}</p>
            </div>
            <UIcon name="i-lucide-calendar-days" class="size-4 shrink-0 text-[var(--color-primary)]" />
          </div>

          <dl class="stay-calendar-popover__facts">
            <div><dt>{{ t('calendar.arrival') }}</dt><dd>{{ formatDate(stay.checkInOn) }}</dd></div>
            <div><dt>{{ t('calendar.departure') }}</dt><dd>{{ formatDate(stay.checkOutOn) }}</dd></div>
            <div><dt>{{ t('calendar.stays') }}</dt><dd>{{ nights }}</dd></div>
            <div><dt>{{ t('calendar.adults') }}</dt><dd>{{ guestCount }} · {{ stay.adultCount }}<span v-if="stay.childCount">, {{ stay.childCount }} {{ t('calendar.children').toLocaleLowerCase() }}</span></dd></div>
          </dl>

          <StayServiceIcons v-if="stay.services?.length" :services="stay.services" :compact="false" />

          <div v-if="showGuestDetails && (stay.guestName || stay.guestPhone || stay.guestComment || stay.specialRequests)" class="stay-calendar-popover__notes">
            <p v-if="stay.guestName"><strong>{{ t('calendar.adults') }}:</strong> {{ stay.guestName }}</p>
            <p v-if="stay.guestPhone"><strong>{{ t('common.phone') }}:</strong> {{ stay.guestPhone }}</p>
            <p v-if="stay.guestComment"><strong>{{ t('calendar.guestComment') }}:</strong> {{ stay.guestComment }}</p>
            <p v-if="stay.specialRequests"><strong>{{ t('common.notes') }}:</strong> {{ stay.specialRequests }}</p>
          </div>

          <div v-if="showFinancialDetails && (stay.services?.length || stay.cashAmountEur !== null && stay.cashAmountEur !== undefined)" class="stay-calendar-popover__notes">
            <p v-if="stay.services?.length"><strong>{{ t('calendar.extraServices') }}:</strong> {{ stay.services.map(service => service.nameSnapshot).join(', ') }}</p>
            <p v-if="stay.cashAmountEur !== null && stay.cashAmountEur !== undefined"><strong>{{ t('calendar.cash') }}:</strong> {{ formatEuro(stay.cashAmountEur) }}</p>
          </div>

          <div class="grid gap-2"><UButton v-if="canEdit" block color="neutral" variant="soft" icon="i-lucide-pencil" @click="editStay">{{ t('calendar.editBooking') }}</UButton><UButton v-if="canManageCleaning" block color="primary" variant="soft" icon="i-lucide-broom" :to="hasCleaning ? `/cleanings/${encodeURIComponent(stay.cleaning!.id)}` : `/work?stayId=${encodeURIComponent(stay.id)}`">{{ hasCleaning ? t('work.open') : t('common.assignCleaning') }}</UButton></div>
        </div>
      </article>
    </template>
  </UPopover>
</template>
