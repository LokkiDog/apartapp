<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import type { Hotel } from '#fsd/entities/hotel'
import type { DateValue } from '@internationalized/date'
import { filterApartmentsByScope, isPropertyScopeReady, propertyScopeQuery, PropertyScopeFilter, type PropertyScopeValue } from '#fsd/features/select-property-scope'
import { apartmentCalendarColor, formatDate, formatEuro } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { DateRangeInput, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import StayCalendarPopover from './StayCalendarPopover.vue'
import StayServiceIcons from './StayServiceIcons.vue'
import StayDetailsSlideover from './StayDetailsSlideover.vue'
import ApartmentBookingsView from './ApartmentBookingsView.vue'
import { useI18n } from 'vue-i18n'
import { assignMonthWeekLanes, createWeekSegments, type CalendarStaySegment } from './model/calendar-timeline'
import { bookingsForApartment, calendarRange as calendarPeriodRange, migrateCalendarView, type BookingView, type CalendarPeriod } from './model/calendar-view'
import { createStayAgenda, filterStayAgenda, stayAgendaQueryFrom, type StayAgendaStatus } from './model/stay-agenda'
import { stayCleaningHref, stayCleaningPresentation } from './model/stay-cleaning'

type CleaningAssignmentFilter = 'all' | 'assigned' | 'unassigned'
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
const cleaningAssignmentFilter = ref<CleaningAssignmentFilter>('all')
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
const expandedMonthWeeks = ref(new Set<string>())
const form = reactive<StayForm>(emptyStayForm())
const showGuestDetails = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const showFinancialDetails = computed(() => Boolean(user.value?.roles.includes('administrator')))
const canEditStays = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))

const { data: hotels } = await useAsyncData('calendar-hotels', () => user.value ? $fetch<Hotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: apartments, error: apartmentsError } = await useAsyncData('calendar-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: services } = await useAsyncData('calendar-services', () => user.value ? $fetch<SpecialServiceOption[]>('/api/special-services') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const range = computed(() => calendarPeriodRange(calendarPeriod.value, cursor.value))
const selectedScope = computed<PropertyScopeValue>(() => ({ ...propertyScope, apartmentIds: [...propertyScope.apartmentIds] }))
const scopeReady = computed(() => isPropertyScopeReady(selectedScope.value))
const stayQuery = computed(() => ({
  ...propertyScopeQuery(selectedScope.value),
  ...(bookingView.value !== 'calendar'
    ? { from: stayAgendaQueryFrom(todayKey()) }
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
const filteredStays = computed(() => (stays.value ?? []).filter(stay => {
  if (cleaningAssignmentFilter.value === 'all') return true
  return cleaningAssignmentFilter.value === 'assigned' ? Boolean(stay.cleaning?.id) : !stay.cleaning?.id
}))
const weekDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthWeeks = computed(() => Array.from({ length: Math.ceil(monthDays.value.length / 7) }, (_, index) => monthDays.value.slice(index * 7, index * 7 + 7)))
const monthWeekdayHeadings = computed(() => monthWeeks.value[0] ?? [])
const agendaDays = computed(() => filterStayAgenda(createStayAgenda(filteredStays.value, todayKey()), selectedAgendaStatuses.value))
const calendarDays = computed(() => calendarPeriod.value === 'day' ? [cursor.value] : weekDays.value)
const monthWeekLayouts = computed(() => assignMonthWeekLanes(
  filteredStays.value,
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
function stayArrives(stay: Stay, day: string) { return stay.checkInOn === day }
function stayDeparts(stay: Stay, day: string) { return stay.checkOutOn === day }
function staysForApartmentWeek(apartmentId: string) { return filteredStays.value.filter(stay => stay.apartmentId === apartmentId && stay.checkInOn < range.value.to && stay.checkOutOn >= range.value.from) }
function weekSegmentsForApartment(apartmentId: string) { return createWeekSegments(staysForApartmentWeek(apartmentId), range.value.from, range.value.to) }
function isStayDateDisabled(date: DateValue) {
  if (!form.apartmentId) return false
  const day = date.toString()
  const selectedStart = form.checkInOn
  return filteredStays.value
    .filter(stay => stay.apartmentId === form.apartmentId && stay.id !== editingStay.value?.id)
    .some(stay => selectedStart
      ? day > stay.checkInOn && day < stay.checkOutOn
      : day >= stay.checkInOn && day < stay.checkOutOn)
}
function segmentGrid(segment: CalendarStaySegment<Stay>, lane?: number) { return { gridColumn: `${segment.startHalf + 1} / ${segment.endHalf + 1}`, ...(lane === undefined ? {} : { gridRow: String(lane + 1) }) } }
function weekMarkerGrid(value: string) { const dayIndex = weekDays.value.indexOf(value); return { gridColumn: `${dayIndex * 2 + 1} / span 2` } }
function monthMarkerEntries(day: string) { return filteredStays.value.filter(stay => stayArrives(stay, day) || stayDeparts(stay, day)) }
function monthMarkerLabel(stay: Stay, day: string) { return `${stayArrives(stay, day) ? t('calendar.arrival') : t('calendar.departure')} · ${stay.apartment.name}` }
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
function agendaGuestLabel(stay: Stay) {
  const count = stay.adultCount + stay.childCount
  return [stay.guestName, `${count} ${t('common.guestsPlural', count)}`].filter(Boolean).join(' · ')
}
function agendaGuestCountLabel(stay: Stay) {
  const count = stay.adultCount + stay.childCount
  return `${count} ${t('common.guestsPlural', count)}`
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
function cleaningPresentation(stay: Stay) { return stayCleaningPresentation(stay, t) }
function cleaningHref(stay: Stay) { return stayCleaningHref(stay) }
function shift(direction: number) { cursor.value = addDays(cursor.value, direction * (calendarPeriod.value === 'month' ? 31 : calendarPeriod.value === 'week' ? 7 : 1)) }
function goToday() { cursor.value = todayKey() }
function openCreate() {
  editingStay.value = null
  Object.assign(form, emptyStayForm())
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
      <template #actions><UButton icon="i-lucide-plus" @click="openCreate">{{ t('calendar.newBooking') }}</UButton></template>
    </PageHeader>

    <div class="calendar-controls surface">
      <div class="calendar-controls__top" :class="{ 'calendar-controls__top--agenda': bookingView !== 'calendar' }">
        <div v-if="bookingView === 'calendar'" class="flex flex-wrap items-center gap-2">
          <UButton color="neutral" variant="ghost" @click="goToday">{{ t('calendar.today') }}</UButton>
          <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" :aria-label="t('calendar.previous')" @click="shift(-1)" />
          <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('calendar.next')" @click="shift(1)" />
          <p class="calendar-range-title">{{ heading }}</p>
        </div>
        <div class="calendar-controls__views">
          <UFieldGroup class="calendar-view-switch">
            <UButton :variant="bookingView === 'dates' ? 'solid' : 'soft'" @click="bookingView = 'dates'">{{ t('calendar.byDates') }}</UButton>
            <UButton :variant="bookingView === 'apartments' ? 'solid' : 'soft'" @click="bookingView = 'apartments'">{{ t('calendar.byApartments') }}</UButton>
            <UButton :variant="bookingView === 'calendar' ? 'solid' : 'soft'" @click="bookingView = 'calendar'">{{ t('calendar.calendar') }}</UButton>
          </UFieldGroup>
          <UFieldGroup v-if="bookingView === 'calendar'" class="calendar-period-switch">
            <UButton :variant="calendarPeriod === 'month' ? 'solid' : 'soft'" @click="calendarPeriod = 'month'">{{ t('calendar.month') }}</UButton>
            <UButton :variant="calendarPeriod === 'week' ? 'solid' : 'soft'" @click="calendarPeriod = 'week'">{{ t('calendar.week') }}</UButton>
            <UButton :variant="calendarPeriod === 'day' ? 'solid' : 'soft'" @click="calendarPeriod = 'day'">{{ t('calendar.day') }}</UButton>
          </UFieldGroup>
          <UButton v-if="bookingView === 'calendar'" :variant="eventsOnly ? 'solid' : 'soft'" color="primary" icon="i-lucide-arrow-left-right" class="calendar-events-toggle min-h-11 active:scale-[0.96] transition-transform" @click="eventsOnly = !eventsOnly">{{ eventsOnly ? t('calendar.bookingsAndDepartures') : t('calendar.stays') }}</UButton>
        </div>
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
            <UFormField :label="t('calendar.cleaning')" class="calendar-controls__cleaning-filter">
              <USelect v-model="cleaningAssignmentFilter" :items="[
                { label: t('calendar.allBookings'), value: 'all' },
                { label: t('calendar.assigned'), value: 'assigned' },
                { label: t('calendar.unassigned'), value: 'unassigned' }
              ]" class="w-full" />
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

    <div v-else-if="bookingView === 'dates' && agendaDays.length" class="stay-agenda">
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
                <article v-for="item in category.items" :key="`${day.date}-${item.stay.id}-${item.status}`" class="stay-agenda-item">
                  <button type="button" class="booking-row-open" :aria-label="t('calendarExtra.openBooking', { apartment: item.stay.apartment.name })" @click="openDetails(item.stay)" />
                  <div class="stay-agenda-item__content">
                    <div class="stay-agenda-item__title-row">
                      <p class="stay-agenda-item__apartment">{{ item.stay.apartment.name }} <span>· {{ item.stay.apartment.hotel.name }}</span></p>
                      <span class="stay-agenda-item__title-meta">
                        <span class="stay-agenda-item__guest-count">{{ agendaGuestCountLabel(item.stay) }}</span>
                        <StayServiceIcons :services="item.stay.services" />
                      </span>
                    </div>
                    <p class="stay-agenda-item__meta">
                      <span class="stay-agenda-item__guest-details">{{ agendaGuestLabel(item.stay) }}</span>
                      <span v-if="item.stay.guestName" class="stay-agenda-item__guest-name">{{ item.stay.guestName }}</span>
                      <span class="stay-agenda-item__dates">{{ formatDate(item.stay.checkInOn) }} → {{ formatDate(item.stay.checkOutOn) }}</span>
                    </p>
                  </div>
                  <div class="stay-agenda-item__actions">
                    <NuxtLink v-if="user?.roles.includes('administrator')" :to="cleaningHref(item.stay)" class="stay-cleaning-indicator" :class="cleaningPresentation(item.stay).className" :title="cleaningPresentation(item.stay).label" :aria-label="cleaningPresentation(item.stay).label"><UIcon :name="cleaningPresentation(item.stay).icon" class="size-4" /></NuxtLink>
                    <UDropdownMenu v-if="stayMenuItems(item.stay).length" :items="stayMenuItems(item.stay)" :content="{ align: 'end' }">
                      <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="`${t('calendar.editBooking')} ${item.stay.apartment.name}`" class="stay-agenda-action active:scale-[0.96] transition-transform" />
                    </UDropdownMenu>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>
      </UCollapsible>
    </div>
    <EmptyState v-else-if="bookingView === 'dates'" icon="i-lucide-calendar-check-2" :title="t('calendar.eventTypes')" :description="t('calendar.chooseScope')"><template #actions><UButton @click="openCreate">{{ t('calendar.newBooking') }}</UButton></template></EmptyState>

    <ApartmentBookingsView v-else-if="bookingView === 'apartments' && visibleApartments.length" :apartments="visibleApartments" :stays="filteredStays" :can-edit="canEditStays" :can-delete="Boolean(user?.roles.includes('administrator'))" @open="openDetails" @edit="openEdit" @delete="openDelete" />
    <EmptyState v-else-if="bookingView === 'apartments'" icon="i-lucide-building-2" :title="t('scope.apartmentsLabel')" :description="t('scope.loadErrorDescription')" />

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
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkInOn >= range.from && item.checkInOn < range.to)" :key="`${stay.id}-arrival`" :stay="stay" context="arrival" :left-label="t('calendar.arrival')" event-class="calendar-arrival calendar-week-marker calendar-week-arrival" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkInOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" :can-edit="canEditStays" :can-manage-cleaning="user?.roles.includes('administrator')" @edit="openEdit" />
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkOutOn >= range.from && item.checkOutOn < range.to)" :key="`${stay.id}-departure`" :stay="stay" context="departure" :left-label="t('calendar.departure')" event-class="calendar-departure calendar-week-marker calendar-week-departure" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkOutOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" :can-edit="canEditStays" :can-manage-cleaning="user?.roles.includes('administrator')" @edit="openEdit" />
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
                <StayCalendarPopover
                  v-for="stay in monthMarkerEntries(day).slice(0, 3)"
                  :key="`${stay.id}-${day}`"
                  :stay="stay"
                  :context="stayDeparts(stay, day) ? 'departure' : 'arrival'"
                  :left-label="monthMarkerLabel(stay, day)"
                  event-class="calendar-month-event"
                  :event-style="eventStyle(stay)"
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

    <StayDetailsSlideover v-model:open="detailsOpen" :stay="selectedStay" :can-edit="canEditStays" :can-manage-cleaning="Boolean(user?.roles.includes('administrator'))" @edit="openEdit" />

    <USlideover v-model:open="open" :title="editingStay ? t('calendar.editBooking') : t('calendar.newStay')">
      <template #body>
        <form id="stay-form" class="form-grid stay-form-grid" @submit.prevent="saveStay">
          <UFormField :label="t('calendar.apartment')">
            <USelect
              v-model="form.apartmentId"
              :items="visibleApartments.map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))"
              :disabled="Boolean(editingStay)"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField :label="t('calendar.stayPeriod')"><DateRangeInput v-model:start="form.checkInOn" v-model:end="form.checkOutOn" :is-date-disabled="isStayDateDisabled" required /></UFormField>
          <p class="text-sm text-[var(--color-muted)]">{{ t('calendar.departureFree') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <UFormField :label="t('calendar.adults')"><UInput v-model.number="form.adultCount" type="number" min="1" /></UFormField>
            <UFormField :label="t('calendar.children')"><UInput v-model.number="form.childCount" type="number" min="0" /></UFormField>
          </div>
          <USeparator />
          <UFormField :label="t('calendar.guestComment')"><UTextarea v-model="form.guestComment" class="w-full" /></UFormField>
          <div v-if="formServices.length" class="rounded-xl bg-[#f4f8f6] px-0 py-1">
            <p class="font-semibold">{{ t('calendar.extraServices') }}</p>
            <label v-for="service in formServices" :key="service.id" class="mt-1 flex min-h-11 items-center justify-between gap-3 text-sm">
              <span class="flex items-center gap-3">
                <UCheckbox :model-value="form.serviceIds.includes(service.id)" :value="service.id" @update:model-value="setServiceSelected(service.id, $event)" />
                <span>{{ service.name }} <span v-if="!service.active" class="text-[var(--color-muted)]">({{ t('calendar.unavailable') }})</span></span>
              </span>
              <span class="font-semibold tabular-nums">{{ formatEuro(service.priceEur) }}</span>
            </label>
          </div>
          <UFormField :label="t('calendar.cash')"><MoneyInput v-model="form.cashAmountEur" /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
        </form>
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
