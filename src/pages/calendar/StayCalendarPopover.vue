<script lang="ts">
import { shallowRef } from 'vue'

const activeOwner = shallowRef<symbol | null>(null)
</script>

<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { stayCleaningPresentation } from './model/stay-cleaning'

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

const owner = Symbol('stay-calendar-popover')
const isOpen = computed({
  get: () => activeOwner.value === owner,
  set: value => { activeOwner.value = value ? owner : (activeOwner.value === owner ? null : activeOwner.value) }
})

const contextLabel = computed(() => ({ arrival: 'Заезд', stay: 'Проживание', departure: 'Выезд' })[props.context])
const hasCleaning = computed(() => Boolean(props.stay.cleaning?.id))
const cleaningPresentation = computed(() => stayCleaningPresentation(props.stay))
const nights = computed(() => Math.max(0, Math.round((Date.parse(`${props.stay.checkOutOn}T12:00:00Z`) - Date.parse(`${props.stay.checkInOn}T12:00:00Z`)) / 86400000)))
const guestCount = computed(() => props.stay.adultCount + props.stay.childCount)

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
        :aria-label="`${contextLabel}: ${stay.apartment.name}, ${formatDate(stay.checkInOn)} — ${formatDate(stay.checkOutOn)}${canManageCleaning ? `. ${cleaningPresentation.label}` : ''}`"
      >
        <span v-if="continuesLeft" class="stay-calendar-trigger__arrow stay-calendar-trigger__arrow--left" aria-hidden="true" />
        <span v-if="leftLabel" class="stay-calendar-trigger__left">{{ leftLabel }}</span>
        <span v-if="rightLabel" class="stay-calendar-trigger__right">{{ rightLabel }}</span>
        <span v-if="canManageCleaning" class="stay-cleaning-marker" :class="cleaningPresentation.className" :title="cleaningPresentation.label" aria-hidden="true"><UIcon :name="cleaningPresentation.icon" class="size-3" /></span>
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
            <div><dt>Заезд</dt><dd>{{ formatDate(stay.checkInOn) }}</dd></div>
            <div><dt>Выезд</dt><dd>{{ formatDate(stay.checkOutOn) }}</dd></div>
            <div><dt>Проживание</dt><dd>{{ nights }} {{ nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей' }}</dd></div>
            <div><dt>Гости</dt><dd>{{ guestCount }} · {{ stay.adultCount }} взрослых<span v-if="stay.childCount">, {{ stay.childCount }} детей</span></dd></div>
          </dl>

          <div v-if="showGuestDetails && (stay.guestName || stay.guestPhone || stay.guestComment || stay.specialRequests)" class="stay-calendar-popover__notes">
            <p v-if="stay.guestName"><strong>Гость:</strong> {{ stay.guestName }}</p>
            <p v-if="stay.guestPhone"><strong>Телефон:</strong> {{ stay.guestPhone }}</p>
            <p v-if="stay.guestComment"><strong>Комментарий:</strong> {{ stay.guestComment }}</p>
            <p v-if="stay.specialRequests"><strong>Пожелания:</strong> {{ stay.specialRequests }}</p>
          </div>

          <div v-if="showFinancialDetails && (stay.services?.length || stay.cashAmountEur !== null && stay.cashAmountEur !== undefined)" class="stay-calendar-popover__notes">
            <p v-if="stay.services?.length"><strong>Услуги:</strong> {{ stay.services.map(service => service.nameSnapshot).join(', ') }}</p>
            <p v-if="stay.cashAmountEur !== null && stay.cashAmountEur !== undefined"><strong>Наличные:</strong> {{ formatEuro(stay.cashAmountEur) }}</p>
          </div>

          <div class="grid gap-2"><UButton v-if="canEdit" block color="neutral" variant="soft" icon="i-lucide-pencil" @click="editStay">Изменить заезд</UButton><UButton v-if="canManageCleaning" block color="primary" variant="soft" icon="i-lucide-sparkles" :to="hasCleaning ? `/cleanings/${encodeURIComponent(stay.cleaning!.id)}` : `/work?stayId=${encodeURIComponent(stay.id)}`">{{ hasCleaning ? 'Открыть уборку' : 'Назначить уборку' }}</UButton></div>
        </div>
      </article>
    </template>
  </UPopover>
</template>
