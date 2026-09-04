<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import type { Hotel } from '#fsd/entities/hotel'
import type { DateValue } from '@internationalized/date'
import { filterApartmentsByScope, isPropertyScopeReady, propertyScopeQuery, PropertyScopeFilter, type PropertyScopeValue } from '#fsd/features/select-property-scope'
import { apartmentCalendarColor, createFormValidator, formatDate, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { DateRangeInput, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import StayCalendarPopover from './StayCalendarPopover.vue'
import CalendarEventMarker from './CalendarEventMarker.vue'
import StayBookingRow from './StayBookingRow.vue'
import StayDetailsSlideover from './StayDetailsSlideover.vue'
import ApartmentBookingsView from './ApartmentBookingsView.vue'
import StayBookingsPanel from './StayBookingsPanel.vue'
import { useI18n } from 'vue-i18n'
import { assignMonthWeekLanes, createWeekSegments, type CalendarStaySegment } from './model/calendar-timeline'
import { createCalendarEventMarkers } from './model/calendar-event-markers'
import { bookingsForApartment, calendarRange as calendarPeriodRange, migrateCalendarView, type BookingView, type CalendarPeriod } from './model/calendar-view'
import { createStayAgenda, filterStayAgenda, isPastStay, stayAgendaQueryFrom, stayHistoryQueryFrom, type StayAgendaStatus } from './model/stay-agenda'
import { stayInputSchema } from '@contracts/crm'

type CalendarMember = { id: string; status: string; isVika: boolean }
type StayForm = {
  apartmentId: string
  checkInOn: string
  checkOutOn: string
  adultCount: number
  childCount: number
  specialRequests: string
  guestName: string
  guestPhone: string
  guestComment: string
  serviceIds: string[]
  cashAmountEur: number | null
}
type SpecialServiceOption = { id: string; name: string; iconName: string; priceEur: number; managerSharePercent: number; active: boolean }

function emptyStayForm(): StayForm {
  return { apartmentId: '', checkInOn: '', checkOutOn: '', adultCount: 1, childCount: 0, specialRequests: '', guestName: '', guestPhone: '', guestComment: '', serviceIds: [], cashAmountEur: null }
}

const user = useCurrentUser()
const { locale } = useI18n()
const { t } = useI18n()
const formatLocale = computed(() => locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU')
const propertyScope = reactive<PropertyScopeValue>({ scope: 'all', hotelId: 'all', apartmentIds: [] })
const bookingViewStorageKey = 'aparts.calendar.booking-view'
const calendarPeriodStorageKey = 'aparts.calendar.period'
const legacyCalendarViewStorageKey = 'aparts.calendar.view'
const agendaStatusStorageKey = 'aparts.calendar.agenda-statuses'
const allAgendaStatuses: StayAgendaStatus[] = ['arrival', 'departure', 'staying']
const agendaStatusOptions = computed(() => [
  { label: t('calendar.arrival'), value: 'arrival' as const },
  { label: t('calendar.departure'), value: 'departure' as const },
  { label: t('calendar.stays'), value: 'staying' as const }
])
const bookingView = ref<BookingView>('dates')
const calendarPeriod = ref<CalendarPeriod>('month')
const eventsOnly = ref(false)
const onlyVika = ref(false)
const selectedAgendaStatuses = ref<StayAgendaStatus[]>([...allAgendaStatuses])
const cursor = ref(todayKey())
const open = ref(false)
const detailsOpen = ref(false)
const selectedStay = ref<Stay | null>(null)
const editingStay = ref<Stay | null>(null)
const deleteOpen = ref(false)
const stayToDelete = ref<Stay | null>(null)
const error = ref('')
const pending = ref(false)
const historyDays = ref(0)
const historyLoading = ref(false)
const expandedMonthWeeks = ref(new Set<string>())
const form = reactive<StayForm>(emptyStayForm())
const validation = useSubmitFormValidation()
const validate = createFormValidator(stayInputSchema, t, { pathMap: { checkOutOn: 'checkInOn' } })
const showGuestDetails = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const showFinancialDetails = computed(() => Boolean(user.value?.roles.includes('administrator')))
const canEditStays = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))

const { data: hotels } = await useAsyncData('calendar-hotels', () => user.value ? $fetch<Hotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: apartments, error: apartmentsError } = await useAsyncData('calendar-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const isAdministrator = computed(() => Boolean(user.value?.roles.includes('administrator')))
const { data: members } = await useAsyncData('calendar-users', () => isAdministrator.value ? $fetch<CalendarMember[]>('/api/users') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: services } = await useAsyncData('calendar-services', () => user.value ? $fetch<SpecialServiceOption[]>('/api/special-services') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const vikaAccount = computed(() => (members.value ?? []).find(member => member.isVika) ?? null)
watch(vikaAccount, account => { if (!account) onlyVika.value = false }, { immediate: true })
const range = computed(() => calendarPeriodRange(calendarPeriod.value, cursor.value))
const selectedScope = computed<PropertyScopeValue>(() => ({ ...propertyScope, apartmentIds: [...propertyScope.apartmentIds] }))
const scopeReady = computed(() => isPropertyScopeReady(selectedScope.value))
const stayQuery = computed(() => ({
  ...propertyScopeQuery(selectedScope.value),
  ...(onlyVika.value ? { onlyVika: true } : {}),
  ...(bookingView.value !== 'calendar'
    ? { from: historyDays.value ? stayHistoryQueryFrom(todayKey(), historyDays.value) : stayAgendaQueryFrom(todayKey()), includeUncleaned: true }
    : { from: addDays(range.value.from, -1), to: range.value.to })
}))
const { data: stays, status, refresh } = await useAsyncData('calendar-stays', () => {
  if (!user.value || !scopeReady.value) return Promise.resolve([] as Stay[])
  return $fetch<Stay[]>('/api/stays', { query: stayQuery.value })
}, { server: false, default: () => [], watch: [user, stayQuery] })
const formServices = computed<SpecialServiceOption[]>(() => {
  const available = new Map((services.value ?? []).filter(service => service.active).map(service => [service.id, service]))
  for (const selected of editingStay.value?.services ?? []) {
    const current = (services.value ?? []).find(service => service.id === selected.specialServiceId)
    available.set(selected.specialServiceId, {
      id: selected.specialServiceId,
      name: selected.nameSnapshot,
      iconName: selected.iconNameSnapshot,
      priceEur: selected.priceEurSnapshot,
      managerSharePercent: selected.managerSharePercentSnapshot,
      active: current?.active ?? false
    })
  }
  return [...available.values()]
})
const visibleApartments = computed(() => filterApartmentsByScope(apartments.value ?? [], selectedScope.value))
const ownApartments = computed(() => {
  const userId = user.value?.id
  return userId ? (apartments.value ?? []).filter(apartment => apartment.managers.some(manager => manager.id === userId)) : []
})
const canCreateStays = computed(() => canEditStays.value && ownApartments.value.length > 0)
const formApartments = computed(() => {
  if (!editingStay.value) return ownApartments.value
  return (apartments.value ?? []).filter(apartment => apartment.id === editingStay.value?.apartmentId)
})
const calendarStays = computed(() => stays.value ?? [])
const currentStays = computed(() => calendarStays.value.filter(stay => !isPastStay(stay, todayKey())))
const uncleanedPastStays = computed(() => calendarStays.value.filter(stay => isPastStay(stay, todayKey()) && !(stay.hasCleaning ?? Boolean(stay.cleaning?.id))).sort((left, right) => left.checkOutOn.localeCompare(right.checkOutOn)))
const historyStays = computed(() => calendarStays.value.filter(stay => isPastStay(stay, todayKey()) && (stay.hasCleaning ?? Boolean(stay.cleaning?.id))).sort((left, right) => right.checkOutOn.localeCompare(left.checkOutOn) || right.checkInOn.localeCompare(left.checkInOn)))
const weekDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthWeeks = computed(() => Array.from({ length: Math.ceil(monthDays.value.length / 7) }, (_, index) => monthDays.value.slice(index * 7, index * 7 + 7)))
const monthWeekdayHeadings = computed(() => monthWeeks.value[0] ?? [])
const agendaDays = computed(() => filterStayAgenda(createStayAgenda(currentStays.value, todayKey()), selectedAgendaStatuses.value))
const calendarDays = computed(() => calendarPeriod.value === 'day' ? [cursor.value] : weekDays.value)
const calendarEventMarkers = computed(() => createCalendarEventMarkers(calendarStays.value, calendarPeriod.value === 'month' ? monthDays.value : calendarDays.value))
const monthWeekLayouts = computed(() => assignMonthWeekLanes(
  calendarStays.value,
  monthWeeks.value.filter(week => week.length).map(week => ({ from: week[0]!, to: addDays(week[0]!, 7) }))
))
const heading = computed(() => calendarPeriod.value === 'month'
  ? new Intl.DateTimeFormat(formatLocale.value, { month: 'long', year: 'numeric', timeZone: 'Europe/Sofia' }).format(dateFromKey(cursor.value))
  : calendarPeriod.value === 'day' ? formatDate(cursor.value)
  : `${formatDate(range.value.from)} — ${formatDate(addDays(range.value.to, -1))}`)

onMounted(() => {
  const storedView = localStorage.getItem(bookingViewStorageKey)
  const storedPeriod = localStorage.getItem(calendarPeriodStorageKey)
  if (storedView === 'dates' || storedView === 'apartments' || storedView === 'calendar') bookingView.value = storedView
  else {
    const migrated = migrateCalendarView(localStorage.getItem(legacyCalendarViewStorageKey))
    bookingView.value = migrated.bookingView
    calendarPeriod.value = migrated.calendarPeriod
  }
  if (storedPeriod === 'month' || storedPeriod === 'week' || storedPeriod === 'day') calendarPeriod.value = storedPeriod
  const storedStatuses = localStorage.getItem(agendaStatusStorageKey)
  if (storedStatuses) {
    try {
      const parsed = JSON.parse(storedStatuses)
      if (Array.isArray(parsed) && parsed.every(status => allAgendaStatuses.includes(status))) selectedAgendaStatuses.value = parsed
    } catch { /* use all statuses */ }
  }
})

watch(bookingView, value => {
  if (import.meta.client) localStorage.setItem(bookingViewStorageKey, value)
})

watch(calendarPeriod, value => {
  if (import.meta.client) localStorage.setItem(calendarPeriodStorageKey, value)
})

watch(selectedAgendaStatuses, value => {
  if (import.meta.client) localStorage.setItem(agendaStatusStorageKey, JSON.stringify(value))
})

watch(visibleApartments, value => {
  if (form.apartmentId && !value.some(apartment => apartment.id === form.apartmentId)) form.apartmentId = ''
})

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Sofia' }).format(new Date())
}
function dateFromKey(value: string) { return new Date(`${value}T12:00:00Z`) }
function addDays(value: string, amount: number) { const date = dateFromKey(value); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10) }
function daysBetween(from: string, to: string) { const days: string[] = []; for (let day = from; day < to; day = addDays(day, 1)) days.push(day); return days }
function isToday(day: string) { return day === todayKey() }
function isCurrentMonth(day: string) { const current = dateFromKey(cursor.value); const date = dateFromKey(day); return current.getUTCMonth() === date.getUTCMonth() && current.getUTCFullYear() === date.getUTCFullYear() }
function weekday(day: string, short = false) { return new Intl.DateTimeFormat(formatLocale.value, { weekday: short ? 'short' : 'long', timeZone: 'Europe/Sofia' }).format(dateFromKey(day)) }
function dayNumber(day: string) { return dateFromKey(day).getUTCDate() }
function staysForApartmentWeek(apartmentId: string) { return calendarStays.value.filter(stay => stay.apartmentId === apartmentId && stay.checkInOn < range.value.to && stay.checkOutOn >= range.value.from) }
function weekSegmentsForApartment(apartmentId: string) { return createWeekSegments(staysForApartmentWeek(apartmentId), range.value.from, range.value.to) }
function markersForApartmentWeek(apartmentId: string) { return calendarEventMarkers.value.filter(marker => marker.apartmentId === apartmentId) }
function isStayDateDisabled(date: DateValue) {
  if (!form.apartmentId) return false
  const day = date.toString()
  const selectedStart = form.checkInOn
  return calendarStays.value
    .filter(stay => stay.apartmentId === form.apartmentId && stay.id !== editingStay.value?.id)
    .some(stay => selectedStart
      ? day > stay.checkInOn && day < stay.checkOutOn
      : day >= stay.checkInOn && day < stay.checkOutOn)
}
function segmentGrid(segment: CalendarStaySegment<Stay>, lane?: number) { return { gridColumn: `${segment.startHalf + 1} / ${segment.endHalf + 1}`, ...(lane === undefined ? {} : { gridRow: String(lane + 1) }) } }
function weekMarkerGrid(value: string) { const dayIndex = weekDays.value.indexOf(value); return { gridColumn: `${dayIndex * 2 + 1} / span 2` } }
function monthMarkerEntries(day: string) { return calendarEventMarkers.value.filter(marker => marker.date === day) }
function agendaDateLabel(day: string, compact = false) {
  const today = todayKey()
  const tomorrow = addDays(today, 1)
  const formatted = new Intl.DateTimeFormat(formatLocale.value, {
    ...(compact ? {} : { weekday: 'long' as const }),
    day: 'numeric',
    month: 'long',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' as const }),
    timeZone: 'Europe/Sofia'
  }).format(dateFromKey(day))
  if (day === today) return `${t('common.today')}, ${formatted.replace(/^./, letter => letter.toLowerCase())}`
  if (day === tomorrow) return `${t('calendarExtra.tomorrow')}, ${formatted.replace(/^./, letter => letter.toLowerCase())}`
  return formatted.replace(/^./, letter => letter.toUpperCase())
}
function agendaCategory(status: StayAgendaStatus) {
  return {
    departure: { label: t('calendar.departure'), emptyLabel: t('calendar.departure'), icon: 'i-lucide-log-out' },
    arrival: { label: t('calendar.arrival'), emptyLabel: t('calendar.arrival'), icon: 'i-lucide-log-in' },
    staying: { label: t('calendar.stays'), emptyLabel: t('calendar.stays'), icon: 'i-lucide-house' }
  }[status]
}
function agendaEventCount(count: number) {
  return `${count} ${t('calendar.eventTypes').toLocaleLowerCase()}`
}
function isMonthWeekExpanded(weekKey: string) { return expandedMonthWeeks.value.has(weekKey) }
function toggleMonthWeek(weekKey: string) {
  const next = new Set(expandedMonthWeeks.value)
  if (next.has(weekKey)) next.delete(weekKey)
  else next.add(weekKey)
  expandedMonthWeeks.value = next
}
function monthWeekStyle(laneCount: number, expanded: boolean, hasToggle: boolean) {
  return {
    '--month-visible-lanes': String(Math.max(1, expanded ? laneCount : Math.min(3, laneCount))),
    '--month-action-height': hasToggle ? '34px' : '0px'
  }
}
function eventStyle(stay: Stay) { const color = apartmentCalendarColor(stay.apartmentId); return { backgroundColor: color.background, color: color.foreground, '--departure-color': color.departure } }
function shift(direction: number) { cursor.value = addDays(cursor.value, direction * (calendarPeriod.value === 'month' ? 31 : calendarPeriod.value === 'week' ? 7 : 1)) }
function goToday() { cursor.value = todayKey() }
async function loadMoreHistory() {
  if (historyLoading.value) return
  historyLoading.value = true
  historyDays.value += 10
  try {
    await refresh()
  } finally {
    historyLoading.value = false
  }
}
function openCreate() {
  if (!canCreateStays.value) return
  editingStay.value = null
  Object.assign(form, emptyStayForm())
  validation.reset()
  error.value = ''
  open.value = true
}
function openEdit(stay: Stay) {
  editingStay.value = stay
  Object.assign(form, {
    apartmentId: stay.apartmentId,
    checkInOn: stay.checkInOn,
    checkOutOn: stay.checkOutOn,
    adultCount: stay.adultCount,
    childCount: stay.childCount,
    specialRequests: stay.specialRequests ?? '',
    guestName: stay.guestName ?? '',
    guestPhone: stay.guestPhone ?? '',
    guestComment: stay.guestComment ?? '',
    serviceIds: stay.services?.map(service => service.specialServiceId) ?? [],
    cashAmountEur: stay.cashAmountEur ?? null
  })
  validation.reset()
  error.value = ''
  open.value = true
}
function openDetails(stay: Stay) {
  selectedStay.value = stay
  detailsOpen.value = true
}
function setServiceSelected(serviceId: string, selected: boolean | 'indeterminate') {
  if (selected === true) {
    if (!form.serviceIds.includes(serviceId)) form.serviceIds.push(serviceId)
    return
  }
  form.serviceIds = form.serviceIds.filter(id => id !== serviceId)
}
function openDelete(stay: Stay) { stayToDelete.value = stay; deleteOpen.value = true; error.value = '' }
function stayMenuItems(stay: Stay): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (canEditStays.value) items.push({ label: t('calendar.editBooking'), icon: 'i-lucide-pencil', onSelect: () => openEdit(stay) })
  if (user.value?.roles.includes('administrator')) items.push({ label: t('calendar.deleteBooking'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(stay) })
  return items.length ? [items] : []
}
async function removeStay() { if (!stayToDelete.value) return; pending.value = true; error.value = ''; try { await $fetch(`/api/stays/${stayToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; stayToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') } finally { pending.value = false } }
async function saveStay() {
  pending.value = true
  error.value = ''
  try {
    if (editingStay.value) await $fetch(`/api/stays/${editingStay.value.id}`, { method: 'PATCH', body: form })
    else await $fetch('/api/stays', { method: 'POST', body: form })
    open.value = false
    editingStay.value = null
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('calendar.title')">
      <template #actions>
        <div class="space-y-1 text-end">
          <UButton icon="i-lucide-plus" :disabled="!canCreateStays" @click="openCreate">{{ t('calendar.newBooking') }}</UButton>
          <p v-if="!canCreateStays" class="text-xs text-[var(--color-muted)]">{{ t('calendar.noOwnedApartments') }}</p>
        </div>
      </template>
    </PageHeader>

    <div class="calendar-controls surface">
      <div class="calendar-controls__top calendar-controls__top--agenda">
        <UFieldGroup class="calendar-view-switch calendar-switch-group">
          <UButton :variant="bookingView === 'dates' ? 'solid' : 'soft'" @click="bookingView = 'dates'">{{ t('calendar.byDates') }}</UButton>
          <UButton :variant="bookingView === 'apartments' ? 'solid' : 'soft'" @click="bookingView = 'apartments'">{{ t('calendar.byApartments') }}</UButton>
          <UButton :variant="bookingView === 'calendar' ? 'solid' : 'soft'" @click="bookingView = 'calendar'">{{ t('calendar.calendar') }}</UButton>
        </UFieldGroup>
      </div>
      <div v-if="bookingView === 'calendar'" class="calendar-controls__calendar-options">
        <div class="calendar-controls__calendar-context">
          <div class="calendar-date-navigation">
            <UButton color="neutral" variant="ghost" @click="goToday">{{ t('calendar.today') }}</UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" :aria-label="t('calendar.previous')" @click="shift(-1)" />
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('calendar.next')" @click="shift(1)" />
            <p class="calendar-range-title">{{ heading }}</p>
          </div>
          <UButton :variant="eventsOnly ? 'solid' : 'soft'" color="primary" icon="i-lucide-arrow-left-right" class="calendar-events-toggle min-h-11 active:scale-[0.96] transition-transform" @click="eventsOnly = !eventsOnly">{{ eventsOnly ? t('calendar.bookingsAndDepartures') : t('calendar.stays') }}</UButton>
        </div>
        <UFieldGroup class="calendar-period-switch calendar-switch-group">
          <UButton :variant="calendarPeriod === 'month' ? 'solid' : 'soft'" @click="calendarPeriod = 'month'">{{ t('calendar.month') }}</UButton>
          <UButton :variant="calendarPeriod === 'week' ? 'solid' : 'soft'" @click="calendarPeriod = 'week'">{{ t('calendar.week') }}</UButton>
          <UButton :variant="calendarPeriod === 'day' ? 'solid' : 'soft'" @click="calendarPeriod = 'day'">{{ t('calendar.day') }}</UButton>
        </UFieldGroup>
      </div>
      <UCollapsible class="calendar-settings" :default-open="false">
        <template #default="{ open: settingsOpen }">
          <button type="button" class="calendar-settings__trigger">
            <span class="calendar-settings__label"><UIcon name="i-lucide-sliders-horizontal" class="size-4" />{{ t('calendar.settings') }}</span>
            <UIcon name="i-lucide-chevron-down" class="calendar-settings__chevron" :class="{ 'calendar-settings__chevron--open': settingsOpen }" />
          </button>
        </template>
        <template #content>
          <div class="calendar-settings__content">
            <PropertyScopeFilter
              v-model:scope="propertyScope.scope"
              v-model:hotel-id="propertyScope.hotelId"
              v-model:apartment-ids="propertyScope.apartmentIds"
              :hotels="hotels ?? []"
              :apartments="apartments ?? []"
              :apartments-error="Boolean(apartmentsError)"
              :scope-label="t('calendar.show')"
              class="calendar-controls__scope"
            />
            <UFormField v-if="isAdministrator" :help="!vikaAccount ? t('calendar.onlyVikaHint') : undefined">
              <UCheckbox v-model="onlyVika" :label="t('calendar.onlyVika')" :disabled="!vikaAccount" class="min-h-11" />
            </UFormField>
            <UFormField v-if="bookingView === 'dates'" :label="t('calendar.eventTypes')" class="calendar-settings__event-types">
              <USelect v-model="selectedAgendaStatuses" :items="agendaStatusOptions" multiple class="w-full" />
            </UFormField>
          </div>
        </template>
      </UCollapsible>
    </div>

    <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 6" :key="item" class="h-20 rounded-2xl" /></div>

    <EmptyState v-else-if="!scopeReady" icon="i-lucide-list-filter" :title="t('calendar.chooseScope')" :description="t('scope.loadErrorDescription')" />

    <StayBookingsPanel
      v-if="scopeReady && bookingView !== 'calendar' && uncleanedPastStays.length"
      :stays="uncleanedPastStays"
      :title="t('calendarHistoryExtra.uncleanedTitle')"
      :group-by="bookingView === 'dates' ? 'date' : 'apartment'"
      :row-variant="bookingView === 'dates' ? 'agenda' : 'apartment'"
      :can-edit="canEditStays"
      :can-delete="Boolean(user?.roles.includes('administrator'))"
      collapsible
      warning
      @open="openDetails"
      @edit="openEdit"
      @delete="openDelete"
    />

    <div v-if="bookingView === 'dates' && agendaDays.length" class="stay-agenda">
      <UCollapsible v-for="(day, dayIndex) in agendaDays" :key="day.date" as="section" :default-open="dayIndex === 0" class="stay-agenda-day surface">
        <template #default="{ open }">
          <button type="button" class="stay-agenda-day__header">
            <div class="stay-agenda-day__date ">
              <h2><span class="stay-agenda-day__date-full">{{ agendaDateLabel(day.date) }}</span><span class="stay-agenda-day__date-compact">{{ agendaDateLabel(day.date, true) }}</span></h2>
              <p class="stay-agenda-day__event-total">{{ agendaEventCount(day.totalCount) }}</p>
            </div>
            <div class="stay-agenda-day__controls">
              <div class="stay-agenda-day__summary" :aria-label="t('reports.dateAndCategory')">
                <span v-if="selectedAgendaStatuses.includes('departure')" class="stay-agenda-count stay-agenda-count--departure" :aria-label="`${t('calendar.departure')}: ${day.counts.departure}`"><UIcon name="i-lucide-log-out" class="size-3.5" />{{ day.counts.departure }}</span>
                <span v-if="selectedAgendaStatuses.includes('arrival')" class="stay-agenda-count stay-agenda-count--arrival" :aria-label="`${t('calendar.arrival')}: ${day.counts.arrival}`"><UIcon name="i-lucide-log-in" class="size-3.5" />{{ day.counts.arrival }}</span>
                <span v-if="selectedAgendaStatuses.includes('staying')" class="stay-agenda-count stay-agenda-count--staying" :aria-label="`${t('calendar.stays')}: ${day.counts.staying}`"><UIcon name="i-lucide-house" class="size-3.5" />{{ day.counts.staying }}</span>
              </div>
              <span class="stay-agenda-day__chevron" :class="{ 'stay-agenda-day__chevron--open': open }" aria-hidden="true"><UIcon name="i-lucide-chevron-down" class="size-5" /></span>
            </div>
          </button>
        </template>
        <template #content>
          <div class="stay-agenda-day__content">
            <section v-for="category in day.categories.filter(category => category.items.length)" :key="category.status" class="stay-agenda-category" :class="`stay-agenda-category--${category.status}`">
              <header class="stay-agenda-category__header">
                <span class="stay-agenda-category__icon"><UIcon :name="agendaCategory(category.status).icon" class="size-5" /></span>
                <h3>{{ agendaCategory(category.status).label }}</h3>
                <span class="stay-agenda-category__count">{{ category.items.length }}</span>
              </header>
              <div class="stay-agenda-category__items">
                <StayBookingRow v-for="item in category.items" :key="`${day.date}-${item.stay.id}-${item.status}`" :stay="item.stay" variant="agenda" :can-edit="canEditStays" :can-delete="Boolean(user?.roles.includes('administrator'))" :can-manage-cleaning="Boolean(user?.roles.includes('administrator'))" @open="openDetails" @edit="openEdit" @delete="openDelete" />
              </div>
            </section>
          </div>
        </template>
      </UCollapsible>
    </div>
    <EmptyState v-else-if="bookingView === 'dates' && !historyDays && !uncleanedPastStays.length && !historyStays.length" icon="i-lucide-calendar-check-2" :title="t('calendar.eventTypes')" :description="t('calendar.chooseScope')"><template #actions><UButton :disabled="!canCreateStays" @click="openCreate">{{ t('calendar.newBooking') }}</UButton><p v-if="!canCreateStays" class="text-sm text-[var(--color-muted)]">{{ t('calendar.noOwnedApartments') }}</p></template></EmptyState>

    <template v-if="bookingView === 'dates' && historyDays">
      <StayBookingsPanel :stays="historyStays" :title="t('calendarHistoryExtra.pastTitle')" group-by="date" row-variant="agenda" :can-edit="canEditStays" :can-delete="Boolean(user?.roles.includes('administrator'))" :empty-label="t('calendarHistoryExtra.pastEmpty')" @open="openDetails" @edit="openEdit" @delete="openDelete" />
    </template>
    <UButton v-if="scopeReady && bookingView === 'dates'" color="neutral" variant="soft" block :loading="historyLoading" icon="i-lucide-history" class="min-h-11 active:scale-[0.96] transition-transform" @click="loadMoreHistory">{{ historyDays ? t('calendarHistoryExtra.loadMorePast') : t('calendarHistoryExtra.pastTitle') }}</UButton>

    <ApartmentBookingsView v-if="bookingView === 'apartments' && visibleApartments.length" :apartments="visibleApartments" :stays="currentStays" :can-edit="canEditStays" :can-delete="Boolean(user?.roles.includes('administrator'))" @open="openDetails" @edit="openEdit" @delete="openDelete" />
    <template v-if="bookingView === 'apartments' && historyDays">
      <StayBookingsPanel :stays="historyStays" :title="t('calendarHistoryExtra.pastTitle')" group-by="apartment" row-variant="apartment" :can-edit="canEditStays" :can-delete="Boolean(user?.roles.includes('administrator'))" :empty-label="t('calendarHistoryExtra.pastEmpty')" @open="openDetails" @edit="openEdit" @delete="openDelete" />
    </template>
    <UButton v-if="scopeReady && bookingView === 'apartments' && visibleApartments.length" color="neutral" variant="soft" block :loading="historyLoading" icon="i-lucide-history" class="min-h-11 active:scale-[0.96] transition-transform" @click="loadMoreHistory">{{ historyDays ? t('calendarHistoryExtra.loadMorePast') : t('calendarHistoryExtra.pastTitle') }}</UButton>
    <EmptyState v-if="bookingView === 'apartments' && !visibleApartments.length" icon="i-lucide-building-2" :title="t('scope.apartmentsLabel')" :description="t('scope.loadErrorDescription')" />

    <div v-else-if="bookingView === 'calendar' && calendarPeriod !== 'month' && visibleApartments.length" class="calendar-board surface">
      <div class="calendar-week-grid" :class="{ 'calendar-week-grid--day': calendarPeriod === 'day' }">
        <div class="calendar-corner">{{ t('calendar.apartment') }}</div>
        <div class="calendar-week-headings"><div v-for="day in calendarDays" :key="day" class="calendar-day-heading" :class="{ 'calendar-day-heading--today': isToday(day) }"><span>{{ weekday(day, true) }}</span><strong>{{ dayNumber(day) }}</strong></div></div>
        <template v-for="apartment in visibleApartments" :key="apartment.id">
          <div class="calendar-apartment-label"><p class="truncate font-semibold">{{ apartment.name }}</p><p class="truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}</p></div>
          <div class="calendar-week-timeline">
            <div v-for="day in calendarDays" :key="`${apartment.id}-${day}`" class="calendar-slot" :class="{ 'calendar-slot--today': isToday(day) }" />
            <div class="calendar-week-events">
              <StayCalendarPopover
                v-if="!eventsOnly"
                v-for="segment in weekSegmentsForApartment(apartment.id)"
                :key="segment.stay.id"
                :stay="segment.stay"
                :context="segment.hasActualArrival ? 'arrival' : 'stay'"
                :left-label="segment.stay.apartment.name"
                :right-label="segment.hasActualDeparture ? segment.stay.apartment.name : ''"
                event-class="calendar-stay calendar-stay-bar calendar-week-stay"
                :event-style="{ ...eventStyle(segment.stay), ...segmentGrid(segment) }"
                :continues-left="segment.continuesLeft"
                :continues-right="segment.continuesRight"
                :show-guest-details="showGuestDetails"
                :show-financial-details="showFinancialDetails"
                :can-edit="canEditStays"
                :can-manage-cleaning="user?.roles.includes('administrator')"
                @edit="openEdit"
              />
              <template v-else>
                <CalendarEventMarker
                  v-for="marker in markersForApartmentWeek(apartment.id)"
                  :key="`${apartment.id}-${marker.date}`"
                  :marker="marker"
                  class="calendar-week-marker"
                  :style="weekMarkerGrid(marker.date)"
                  :show-guest-details="showGuestDetails"
                  :show-financial-details="showFinancialDetails"
                  :can-edit="canEditStays"
                  :can-manage-cleaning="user?.roles.includes('administrator')"
                  @edit="openEdit"
                />
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
    <EmptyState v-else-if="bookingView === 'calendar' && calendarPeriod !== 'month'" icon="i-lucide-building-2" :title="t('scope.apartmentsLabel')" :description="t('scope.loadErrorDescription')" />

    <div v-else-if="bookingView === 'calendar' && calendarPeriod === 'month'" class="calendar-month surface">
      <div class="calendar-month-content">
        <div class="calendar-month-heading"><span v-for="day in monthWeekdayHeadings" :key="day">{{ weekday(day, true) }}</span></div>

        <template v-if="eventsOnly">
          <div v-for="(week, weekIndex) in monthWeeks" :key="`markers-${weekIndex}`" class="calendar-month-week calendar-month-week--markers">
            <div v-for="day in week" :key="day" class="calendar-month-day" :class="{ 'calendar-month-day--muted': !isCurrentMonth(day), 'calendar-month-day--today': isToday(day) }">
              <span class="calendar-month-date">{{ dayNumber(day) }}</span>
              <div class="mt-2 space-y-1">
                <CalendarEventMarker
                  v-for="marker in monthMarkerEntries(day).slice(0, 3)"
                  :key="`${marker.apartmentId}-${day}`"
                  :marker="marker"
                  class="calendar-month-event"
                  show-apartment-name
                  :show-guest-details="showGuestDetails"
                  :show-financial-details="showFinancialDetails"
                  :can-edit="canEditStays"
                  :can-manage-cleaning="user?.roles.includes('administrator')"
                  @edit="openEdit"
                />
                <span v-if="monthMarkerEntries(day).length > 3" class="calendar-marker-more">{{ t('common.more') }} {{ monthMarkerEntries(day).length - 3 }}</span>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <section
            v-for="(layout, weekIndex) in monthWeekLayouts"
            :key="layout.key"
            class="calendar-month-week-row"
            :class="{ 'calendar-month-week-row--expanded': isMonthWeekExpanded(layout.key) }"
          >
            <div class="calendar-month-dates">
              <div v-for="day in monthWeeks[weekIndex]" :key="day" class="calendar-month-date-cell" :class="{ 'calendar-month-date-cell--muted': !isCurrentMonth(day), 'calendar-month-date-cell--today': isToday(day) }">
                <span class="calendar-month-date">{{ dayNumber(day) }}</span>
              </div>
            </div>
            <div
              class="calendar-month-tracks"
              :style="monthWeekStyle(layout.laneCount, isMonthWeekExpanded(layout.key), layout.hiddenStayCount > 0)"
            >
              <div class="calendar-month-track-grid" aria-hidden="true">
                <span v-for="day in monthWeeks[weekIndex]" :key="day" :class="{ 'calendar-month-track-grid__day--muted': !isCurrentMonth(day), 'calendar-month-track-grid__day--today': isToday(day) }" />
              </div>
              <div class="calendar-month-events">
                <StayCalendarPopover
                  v-for="segment in layout.segments"
                  v-show="isMonthWeekExpanded(layout.key) || segment.lane < 3"
                  :key="`${layout.key}-${segment.stay.id}`"
                  :stay="segment.stay"
                  :context="segment.hasActualArrival ? 'arrival' : 'stay'"
                  :left-label="segment.stay.apartment.name"
                  :right-label="segment.hasActualDeparture ? segment.stay.apartment.name : ''"
                  event-class="calendar-stay calendar-stay-bar calendar-month-stay"
                  :event-style="{ ...eventStyle(segment.stay), ...segmentGrid(segment, segment.lane) }"
                  :continues-left="segment.continuesLeft"
                  :continues-right="segment.continuesRight"
                  :show-guest-details="showGuestDetails"
                  :show-financial-details="showFinancialDetails"
                  :can-edit="canEditStays"
                  :can-manage-cleaning="user?.roles.includes('administrator')"
                  @edit="openEdit"
                />
              </div>
              <button v-if="layout.hiddenStayCount > 0" type="button" class="calendar-more" @click="toggleMonthWeek(layout.key)">
                {{ isMonthWeekExpanded(layout.key) ? t('common.hide') : `${t('common.more')} ${layout.hiddenStayCount}` }}
              </button>
            </div>
          </section>
        </template>
      </div>
    </div>

    <StayDetailsSlideover v-model:open="detailsOpen" :stay="selectedStay" :can-edit="canEditStays" :can-manage-cleaning="Boolean(user?.roles.includes('administrator'))" :show-service-prices="showFinancialDetails" @edit="openEdit" />

    <USlideover v-model:open="open" :title="editingStay ? t('calendar.editBooking') : t('calendar.newStay')">
      <template #body>
        <UForm :key="validation.formKey.value" id="stay-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid stay-form-grid" @error="validation.onError" @submit="saveStay">
          <UFormField name="apartmentId" :label="t('calendar.apartment')">
            <USelect
              v-model="form.apartmentId"
              :items="formApartments.map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))"
              :disabled="Boolean(editingStay)"
              class="w-full"
            />
          </UFormField>
          <UFormField name="checkInOn" :error-pattern="/^check(In|Out)On$/" :label="t('calendar.stayPeriod')"><DateRangeInput v-model:start="form.checkInOn" v-model:end="form.checkOutOn" :is-date-disabled="isStayDateDisabled" /></UFormField>
          <p class="text-sm text-[var(--color-muted)]">{{ t('calendar.departureFree') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <UFormField name="adultCount" :label="t('calendar.adults')"><UInput v-model.number="form.adultCount" type="number" min="1" /></UFormField>
            <UFormField name="childCount" :label="t('calendar.children')"><UInput v-model.number="form.childCount" type="number" min="0" /></UFormField>
          </div>
          <USeparator />
          <UFormField name="guestComment" :label="t('calendar.guestComment')"><UTextarea v-model="form.guestComment" class="w-full" /></UFormField>
          <div v-if="formServices.length" class="rounded-xl bg-[#f4f8f6] px-0 py-1">
            <p class="font-semibold">{{ t('calendar.extraServices') }}</p>
            <label v-for="service in formServices" :key="service.id" class="mt-1 flex min-h-11 items-center justify-between gap-3 text-sm">
              <span class="flex items-center gap-3">
                <UCheckbox :model-value="form.serviceIds.includes(service.id)" :value="service.id" @update:model-value="setServiceSelected(service.id, $event)" />
                <span>{{ service.name }} <span v-if="!service.active" class="text-[var(--color-muted)]">({{ t('calendar.unavailable') }})</span></span>
              </span>
              <span v-if="showFinancialDetails" class="font-semibold tabular-nums">{{ formatEuro(service.priceEur) }}</span>
            </label>
          </div>
          <UFormField name="cashAmountEur" :label="t('calendar.cash')"><MoneyInput v-model="form.cashAmountEur" /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
        </UForm>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton type="button" color="neutral" variant="ghost" @click="open = false">{{ t('calendar.cancel') }}</UButton>
          <UButton type="submit" form="stay-form" :loading="pending">{{ editingStay ? t('calendar.saveChanges') : t('calendar.create') }}</UButton>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="deleteOpen" :title="t('calendar.deleteBooking')"><template #body><div class="space-y-5"><p>{{ t('calendar.deleteWarning') }}</p><UAlert color="error" variant="soft" :title="t('common.error')" /><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="deleteOpen = false">{{ t('calendar.cancel') }}</UButton><UButton color="error" :loading="pending" @click="removeStay">{{ t('calendar.deleteForever') }}</UButton></div></div></template></UModal>
  </section>
</template>
