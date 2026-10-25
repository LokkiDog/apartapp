<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Apartment } from '#fsd/entities/apartment'
import { ApartmentSelect } from '#fsd/features/select-apartment'
import type { Stay } from '#fsd/entities/stay'
import type { Hotel } from '#fsd/entities/hotel'
import type { DateValue } from '@internationalized/date'
import { filterApartmentsByScope, isPropertyScopeReady, propertyScopeQuery, PropertyScopeFilter, type PropertyScopeValue } from '#fsd/features/select-property-scope'
import { apartmentCalendarColor, createFormValidator, formatDate, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { useNotificationState } from '#fsd/features/manage-notifications'
import { DateRangeInput, DeleteConfirmModal, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import StayCalendarPopover from './StayCalendarPopover.vue'
import CalendarEventMarker from './CalendarEventMarker.vue'
import StayBookingRow from './StayBookingRow.vue'
import ApartmentBookingsView from './ApartmentBookingsView.vue'
import StayBookingsPanel from './StayBookingsPanel.vue'
import IcalConflictPanel from './IcalConflictPanel.vue'
import { useI18n } from 'vue-i18n'
import { assignMonthWeekLanes, type CalendarStaySegment } from './model/calendar-timeline'
import { createCalendarEventMarkers } from './model/calendar-event-markers'
import { bookingsForApartment, bookingCalendarRange, restoreBookingPreferences, shiftCalendarCursor, type BookingPreferences, type BookingView, type CalendarPeriod } from './model/calendar-view'
import { createStayAgenda, filterStayAgenda, isPastStay, stayAgendaQueryFrom, stayHistoryQueryFrom, type StayAgendaStatus } from './model/stay-agenda'
import { stayInputSchema } from '@contracts/crm'

const LazyStayDetailsSlideover = defineAsyncComponent(() => import('./StayDetailsSlideover.vue'))

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
const route = useRoute()
const notificationState = useNotificationState()
const { locale } = useI18n()
const { t } = useI18n()
const formatLocale = computed(() => locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU')
const propertyScope = reactive<PropertyScopeValue>({ scope: 'all', hotelId: 'all', apartmentIds: [] })
const bookingViewStorageKey = 'aparts.calendar.booking-view'
const calendarPeriodStorageKey = 'aparts.calendar.period'
const eventsOnlyStorageKey = 'aparts.calendar.events-only'
const legacyCalendarViewStorageKey = 'aparts.calendar.view'
const agendaStatusStorageKey = 'aparts.calendar.agenda-statuses'
const allAgendaStatuses: StayAgendaStatus[] = ['arrival', 'departure', 'staying']
const agendaStatusOptions = computed(() => [
  { label: t('calendar.arrival'), value: 'arrival' as const },
  { label: t('calendar.departure'), value: 'departure' as const },
  { label: t('calendar.stays'), value: 'staying' as const }
])
const preferencesKey = 'aparts.calendar.preferences-v2'
const preferences = reactive<BookingPreferences>(restoreBookingPreferences(null, null, null, null))
const bookingView = computed<BookingView>(() => preferences.layout === 'calendar' ? 'calendar' : preferences.grouping)
const calendarLayout = computed({ get: () => preferences.calendarLayout, set: value => { preferences.calendarLayout = value } })
const filtersOpen = ref(false)
const effectivePeriod = computed(() => calendarLayout.value === 'grid' ? 'month' : calendarPeriod.value)
const activeFilterCount = computed(() => Number(propertyScope.scope !== 'all') + Number(onlyVika.value) + Number(bookingView.value === 'dates' && selectedAgendaStatuses.value.length !== 3))
const periodOptions = computed(() => [{ label: t('calendar.month'), value: 'month' }, { label: t('calendar.week'), value: 'week' }, { label: t('calendar.day'), value: 'day' }])
const eventOptions = computed(() => [{ label: t('calendar.stays'), value: 'stays' }, { label: t('calendar.bookingsAndDepartures'), value: 'events' }])
const eventMode = computed({ get: () => eventsOnly.value ? 'events' : 'stays', set: value => { eventsOnly.value = value === 'events' } })
const calendarPeriod = computed<CalendarPeriod>({ get: () => preferences.period, set: value => { preferences.period = value } })
const eventsOnly = ref(false)
const onlyVika = ref(false)
const calendarBoardRef = ref<HTMLElement | null>(null)
const calendarMonthRef = ref<HTMLElement | null>(null)
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
const collapsedMonthMarkerDays = ref(new Set<string>())
let lastTodayScrollContainer: HTMLElement | null = null
let lastTodayScrollKey = ''
const form = reactive<StayForm>(emptyStayForm())
const validation = useSubmitFormValidation()
const validate = createFormValidator(stayInputSchema, t, { pathMap: { checkOutOn: 'checkInOn' } })
const showGuestDetails = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const showFinancialDetails = computed(() => Boolean(user.value?.roles.includes('administrator')))
const canEditStays = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const canDeleteStays = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))

const isAdministrator = computed(() => Boolean(user.value?.roles.includes('administrator')))
const [
  { data: hotels },
  { data: apartments, error: apartmentsError },
  { data: members },
  { data: services }
] = await Promise.all([
  useAsyncData('calendar-hotels', () => user.value ? $fetch<Hotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [user] }),
  useAsyncData('calendar-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] }),
  useAsyncData('calendar-users', () => isAdministrator.value ? $fetch<CalendarMember[]>('/api/users') : Promise.resolve([]), { server: false, default: () => [], watch: [user] }),
  useAsyncData('calendar-services', () => user.value ? $fetch<SpecialServiceOption[]>('/api/special-services') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
])
const vikaAccount = computed(() => (members.value ?? []).find(member => member.isVika) ?? null)
watch(vikaAccount, account => { if (!account) onlyVika.value = false }, { immediate: true })
const range = computed(() => bookingCalendarRange(calendarLayout.value, calendarPeriod.value, cursor.value))
const selectedScope = computed<PropertyScopeValue>(() => ({ ...propertyScope, apartmentIds: [...propertyScope.apartmentIds] }))
const scopeReady = computed(() => isPropertyScopeReady(selectedScope.value))
const stayQuery = computed(() => ({
  ...propertyScopeQuery(selectedScope.value),
  ...(onlyVika.value ? { onlyVika: true } : {}),
  ...(bookingView.value !== 'calendar'
    ? { from: historyDays.value ? stayHistoryQueryFrom(todayKey(), historyDays.value) : stayAgendaQueryFrom(todayKey()), includeUncleaned: true }
    : { from: addDays(range.value.from, -1), to: range.value.to })
}))
const { data: stays, status, error: staysError, refresh } = await useAsyncData('calendar-stays', () => {
  if (!user.value || !scopeReady.value) return Promise.resolve([] as Stay[])
  return $fetch<Stay[]>('/api/stays', { query: stayQuery.value })
}, { server: false, default: () => [], watch: [user, stayQuery] })
watch(notificationState.cleaningRevision, () => {
  if (user.value && scopeReady.value) void refresh()
})
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
async function refreshStayDetails() {
  await refresh()
  if (selectedStay.value) selectedStay.value = (stays.value ?? []).find(stay => stay.id === selectedStay.value?.id) ?? selectedStay.value
}
const currentStays = computed(() => calendarStays.value.filter(stay => !isPastStay(stay, todayKey())))
const uncleanedPastStays = computed(() => isAdministrator.value
  ? calendarStays.value.filter(stay => isPastStay(stay, todayKey()) && !stay.hasCleaning).sort((left, right) => left.checkOutOn.localeCompare(right.checkOutOn))
  : [])
const historyStays = computed(() => calendarStays.value.filter(stay => isPastStay(stay, todayKey()) && (
  !isAdministrator.value || stay.hasCleaning
)).sort((left, right) => right.checkOutOn.localeCompare(left.checkOutOn) || right.checkInOn.localeCompare(left.checkInOn)))
const weekDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthWeeks = computed(() => Array.from({ length: Math.ceil(monthDays.value.length / 7) }, (_, index) => monthDays.value.slice(index * 7, index * 7 + 7)))
const monthWeekdayHeadings = computed(() => monthWeeks.value[0] ?? [])
const agendaDays = computed(() => filterStayAgenda(createStayAgenda(currentStays.value, todayKey()), selectedAgendaStatuses.value))
const calendarDays = computed(() => calendarPeriod.value === 'day' ? [cursor.value] : weekDays.value)
const calendarEventMarkers = computed(() => createCalendarEventMarkers(calendarStays.value, calendarLayout.value === 'grid' ? monthDays.value : calendarDays.value))
const monthWeekLayouts = computed(() => assignMonthWeekLanes(
  calendarStays.value,
  monthWeeks.value.filter(week => week.length).map(week => ({ from: week[0]!, to: addDays(week[0]!, 7) }))
))
const heading = computed(() => effectivePeriod.value === 'month'
  ? new Intl.DateTimeFormat(formatLocale.value, { month: 'long', year: 'numeric', timeZone: 'Europe/Sofia' }).format(dateFromKey(cursor.value))
  : effectivePeriod.value === 'day' ? formatDate(cursor.value)
  : `${formatDate(range.value.from)} — ${formatDate(addDays(range.value.to, -1))}`)

onMounted(() => {
  const storedView = localStorage.getItem(bookingViewStorageKey)
  const storedPeriod = localStorage.getItem(calendarPeriodStorageKey)
  const storedEventsOnly = localStorage.getItem(eventsOnlyStorageKey)
  let saved: unknown = null
  try { saved = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null') } catch { /* restore previous preferences */ }
  Object.assign(preferences, restoreBookingPreferences(saved, storedView, storedPeriod, localStorage.getItem(legacyCalendarViewStorageKey)))
  if (storedEventsOnly === 'true' || storedEventsOnly === 'false') eventsOnly.value = storedEventsOnly === 'true'
  const storedStatuses = localStorage.getItem(agendaStatusStorageKey)
  if (storedStatuses) {
    try {
      const parsed = JSON.parse(storedStatuses)
      if (Array.isArray(parsed) && parsed.every(status => allAgendaStatuses.includes(status))) selectedAgendaStatuses.value = parsed
    } catch { /* use all statuses */ }
  }
})

watch(preferences, value => {
  if (import.meta.client) localStorage.setItem(preferencesKey, JSON.stringify(value))
}, { deep: true })

watch(eventsOnly, value => {
  if (import.meta.client) localStorage.setItem(eventsOnlyStorageKey, String(value))
})

watch(selectedAgendaStatuses, value => {
  if (import.meta.client) localStorage.setItem(agendaStatusStorageKey, JSON.stringify(value))
})

watch([bookingView, calendarLayout, calendarPeriod, cursor, eventsOnly, status], () => {
  void scrollCalendarToToday()
}, { flush: 'post' })

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
async function scrollCalendarToToday() {
  if (!import.meta.client || bookingView.value !== 'calendar' || effectivePeriod.value === 'day') return
  await nextTick()

  const container = calendarLayout.value === 'grid' ? calendarMonthRef.value : calendarBoardRef.value
  const target = container?.querySelector<HTMLElement>('.calendar-day-heading--today, .calendar-month-day--today, .calendar-month-date-cell--today')
  if (!container || !target) return

  const scrollKey = `${calendarLayout.value}:${effectivePeriod.value}:${cursor.value}:${eventsOnly.value}`
  if (lastTodayScrollContainer === container && lastTodayScrollKey === scrollKey) return

  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const stickyApartmentWidth = calendarLayout.value === 'timeline' ? Math.min(164, container.clientWidth) : 0
  const visibleCenter = locale.value === 'he' ? (container.clientWidth - stickyApartmentWidth) / 2 : stickyApartmentWidth + (container.clientWidth - stickyApartmentWidth) / 2
  const targetCenter = targetRect.left - containerRect.left + container.scrollLeft + targetRect.width / 2
  container.scrollTo({ left: locale.value === 'he' ? Math.min(0, targetCenter - visibleCenter) : Math.max(0, targetCenter - visibleCenter), behavior: 'auto' })
  lastTodayScrollContainer = container
  lastTodayScrollKey = scrollKey
}
function weekday(day: string, short = false) { return new Intl.DateTimeFormat(formatLocale.value, { weekday: short ? 'short' : 'long', timeZone: 'Europe/Sofia' }).format(dateFromKey(day)) }
function dayNumber(day: string) { return dateFromKey(day).getUTCDate() }
function staysForApartmentWeek(apartmentId: string) { return calendarStays.value.filter(stay => stay.apartmentId === apartmentId && stay.checkInOn < range.value.to && stay.checkOutOn >= range.value.from) }
function weekSegmentsForApartment(apartmentId: string) {
  return assignMonthWeekLanes(staysForApartmentWeek(apartmentId), [range.value], Number.MAX_SAFE_INTEGER)[0]?.segments ?? []
}
function timelineRowStyle(apartmentId: string) {
  const segments = weekSegmentsForApartment(apartmentId)
  return { '--timeline-lanes': String(Math.max(1, ...segments.map(segment => segment.lane + 1))) }
}
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
function isMonthMarkerDayExpanded(day: string) { return !collapsedMonthMarkerDays.value.has(day) }
function toggleMonthMarkerDay(day: string) {
  const next = new Set(collapsedMonthMarkerDays.value)
  if (next.has(day)) next.delete(day)
  else next.add(day)
  collapsedMonthMarkerDays.value = next
}
function monthWeekStyle(laneCount: number, expanded: boolean, hasToggle: boolean) {
  return {
    '--month-visible-lanes': String(Math.max(1, expanded ? laneCount : Math.min(3, laneCount))),
    '--month-action-height': hasToggle ? '34px' : '0px'
  }
}
function eventStyle(stay: Stay) { const color = apartmentCalendarColor(stay.apartmentId); return { backgroundColor: color.background, color: color.foreground, '--departure-color': color.departure } }
function shift(direction: number) { cursor.value = shiftCalendarCursor(effectivePeriod.value, cursor.value, direction) }
function goToday() { cursor.value = todayKey(); lastTodayScrollKey = ''; void scrollCalendarToToday() }
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
  if (user.value?.roles.some(role => ['administrator', 'manager'].includes(role)) && stay.source !== 'ical' && (isAdministrator.value || stay.checkInOn > todayKey())) items.push({ label: t('calendar.deleteBooking'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(stay) })
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
  <section class="bookings-page" :class="bookingView === 'calendar' ? 'bookings-page--calendar' : 'page-wrap space-y-6'">
    <h1 v-if="bookingView === 'calendar'" class="sr-only">{{ t('calendar.title') }}</h1>
    <PageHeader v-if="bookingView !== 'calendar'" :title="t('calendar.title')">
      <template #actions>
        <div class="space-y-1 text-end">
          <UButton icon="i-lucide-plus" :disabled="!canCreateStays" @click="openCreate">{{ t('calendar.newBooking') }}</UButton>
          <p v-if="!canCreateStays" class="text-xs text-[var(--color-muted)]">{{ t('calendar.noOwnedApartments') }}</p>
        </div>
      </template>
    </PageHeader>

    <IcalConflictPanel class="bookings-conflicts" :is-administrator="isAdministrator" :focus-id="typeof route.query.icalConflict === 'string' ? route.query.icalConflict : undefined" @resolved="refresh" />

    <div class="bookings-toolbar" :class="{ 'surface': bookingView !== 'calendar' }">
      <UFieldGroup class="bookings-toolbar__views">
        <UButton :variant="preferences.layout === 'list' ? 'solid' : 'ghost'" color="primary" :aria-pressed="preferences.layout === 'list'" @click="preferences.layout = 'list'">{{ t('bookingWorkspace.list') }}</UButton>
        <UButton :variant="preferences.layout === 'calendar' ? 'solid' : 'ghost'" color="primary" :aria-pressed="preferences.layout === 'calendar'" @click="preferences.layout = 'calendar'">{{ t('calendar.calendar') }}</UButton>
      </UFieldGroup>
      <UFieldGroup v-if="bookingView !== 'calendar'" class="bookings-toolbar__subviews">
        <UButton :variant="preferences.grouping === 'dates' ? 'soft' : 'ghost'" :aria-pressed="preferences.grouping === 'dates'" @click="preferences.grouping = 'dates'">{{ t('calendar.byDates') }}</UButton>
        <UButton :variant="preferences.grouping === 'apartments' ? 'soft' : 'ghost'" :aria-pressed="preferences.grouping === 'apartments'" @click="preferences.grouping = 'apartments'">{{ t('calendar.byApartments') }}</UButton>
      </UFieldGroup>
      <UFieldGroup v-else class="bookings-toolbar__subviews">
        <UButton :variant="calendarLayout === 'timeline' ? 'soft' : 'ghost'" :aria-pressed="calendarLayout === 'timeline'" @click="calendarLayout = 'timeline'">{{ t('bookingWorkspace.timeline') }}</UButton>
        <UButton :variant="calendarLayout === 'grid' ? 'soft' : 'ghost'" :aria-pressed="calendarLayout === 'grid'" @click="calendarLayout = 'grid'">{{ t('bookingWorkspace.grid') }}</UButton>
      </UFieldGroup>
      <div v-if="bookingView === 'calendar'" class="bookings-toolbar__navigation">
        <UButton color="neutral" variant="ghost" @click="goToday">{{ t('calendar.today') }}</UButton>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" :aria-label="t('calendar.previous')" @click="shift(-1)" />
        <p class="bookings-toolbar__date" aria-live="polite">{{ heading }}</p>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('calendar.next')" @click="shift(1)" />
      </div>
      <div v-if="bookingView === 'calendar'" class="bookings-toolbar__options">
        <USelect v-if="calendarLayout === 'timeline'" v-model="calendarPeriod" :items="periodOptions" :aria-label="t('bookingWorkspace.period')" class="bookings-toolbar__period" />
        <USelect v-model="eventMode" :items="eventOptions" :aria-label="t('bookingWorkspace.events')" class="bookings-toolbar__events" />
      </div>
      <div class="bookings-toolbar__actions">
        <UButton color="neutral" variant="ghost" icon="i-lucide-sliders-horizontal" :aria-label="t('bookingWorkspace.filters')" @click="filtersOpen = true"><span class="bookings-action-label">{{ t('bookingWorkspace.filters') }}</span><UBadge v-if="activeFilterCount" size="sm" color="primary">{{ activeFilterCount }}</UBadge></UButton>
        <UButton v-if="bookingView === 'calendar'" icon="i-lucide-plus" :aria-label="t('bookingWorkspace.newBooking')" :disabled="!canCreateStays" :title="!canCreateStays ? t('calendar.noOwnedApartments') : undefined" @click="openCreate"><span class="bookings-action-label">{{ t('bookingWorkspace.newBooking') }}</span></UButton>
      </div>
    </div>
    <USlideover :modal="true" :overlay="true" v-model:open="filtersOpen" :title="t('bookingWorkspace.filters')">
      <template #body><div class="grid gap-5">
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
      </div></template>
    </USlideover>

    <div class="bookings-content" :class="{ 'bookings-content--calendar': bookingView === 'calendar' }">
    <div v-if="status === 'pending'" class="bookings-loading grid gap-3" role="status" :aria-label="t('common.pageLoading')"><USkeleton v-for="item in 6" :key="item" class="h-20 rounded-2xl" /></div>

    <EmptyState v-if="staysError" icon="i-lucide-triangle-alert" :title="t('common.error')"><template #actions><UButton @click="refresh()">{{ t('bookingWorkspace.retry') }}</UButton></template></EmptyState>
    <EmptyState v-else-if="!scopeReady" icon="i-lucide-list-filter" :title="t('calendar.chooseScope')" :description="t('scope.loadErrorDescription')" />

    <StayBookingsPanel
      v-if="scopeReady && bookingView !== 'calendar' && uncleanedPastStays.length"
      :stays="uncleanedPastStays"
      :title="t('calendarHistoryExtra.uncleanedTitle')"
      :group-by="bookingView === 'dates' ? 'date' : 'apartment'"
      :row-variant="bookingView === 'dates' ? 'agenda' : 'apartment'"
      :can-edit="canEditStays"
      :can-delete="Boolean(user?.roles.includes('administrator'))"
      :can-manage-cleaning="isAdministrator"
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
                <StayBookingRow v-for="item in category.items" :key="`${day.date}-${item.stay.id}-${item.status}`" :stay="item.stay" variant="agenda" :can-edit="canEditStays" :can-delete="canDeleteStays" :can-manage-cleaning="isAdministrator" @open="openDetails" @edit="openEdit" @delete="openDelete" />
              </div>
            </section>
          </div>
        </template>
      </UCollapsible>
    </div>
    <EmptyState v-else-if="bookingView === 'dates' && !historyDays && !uncleanedPastStays.length && !historyStays.length" icon="i-lucide-calendar-check-2" :title="t('calendar.eventTypes')" :description="t('calendar.chooseScope')"><template #actions><UButton :disabled="!canCreateStays" @click="openCreate">{{ t('calendar.newBooking') }}</UButton><p v-if="!canCreateStays" class="text-sm text-[var(--color-muted)]">{{ t('calendar.noOwnedApartments') }}</p></template></EmptyState>

    <template v-if="bookingView === 'dates' && (historyDays || (!isAdministrator && historyStays.length))">
      <StayBookingsPanel :stays="historyStays" :title="t('calendarHistoryExtra.pastTitle')" group-by="date" row-variant="agenda" :can-edit="canEditStays" :can-delete="canDeleteStays" :can-manage-cleaning="isAdministrator" :empty-label="t('calendarHistoryExtra.pastEmpty')" collapsible small-chevron @open="openDetails" @edit="openEdit" @delete="openDelete" />
    </template>
    <UButton v-if="scopeReady && bookingView === 'dates'" color="neutral" variant="soft" block :loading="historyLoading" icon="i-lucide-history" class="min-h-11 active:scale-[0.96] transition-transform" @click="loadMoreHistory">{{ historyDays ? t('calendarHistoryExtra.loadMorePast') : t('calendarHistoryExtra.pastTitle') }}</UButton>

    <ApartmentBookingsView v-if="bookingView === 'apartments' && visibleApartments.length" :apartments="visibleApartments" :stays="currentStays" :can-edit="canEditStays" :can-delete="canDeleteStays" :can-manage-cleaning="isAdministrator" @open="openDetails" @edit="openEdit" @delete="openDelete" />
    <template v-if="bookingView === 'apartments' && (historyDays || (!isAdministrator && historyStays.length))">
      <StayBookingsPanel :stays="historyStays" :title="t('calendarHistoryExtra.pastTitle')" group-by="apartment" row-variant="apartment" :can-edit="canEditStays" :can-delete="canDeleteStays" :can-manage-cleaning="isAdministrator" :empty-label="t('calendarHistoryExtra.pastEmpty')" collapsible small-chevron @open="openDetails" @edit="openEdit" @delete="openDelete" />
    </template>
    <UButton v-if="scopeReady && bookingView === 'apartments' && visibleApartments.length" color="neutral" variant="soft" block :loading="historyLoading" icon="i-lucide-history" class="min-h-11 active:scale-[0.96] transition-transform" @click="loadMoreHistory">{{ historyDays ? t('calendarHistoryExtra.loadMorePast') : t('calendarHistoryExtra.pastTitle') }}</UButton>
    <EmptyState v-if="bookingView === 'apartments' && !visibleApartments.length" icon="i-lucide-building-2" :title="t('scope.apartmentsLabel')" :description="t('scope.loadErrorDescription')" />

    <div v-else-if="bookingView === 'calendar' && calendarLayout === 'timeline' && scopeReady && !staysError && visibleApartments.length" ref="calendarBoardRef" class="calendar-board surface">
      <div class="calendar-week-grid booking-timeline" :class="{ 'calendar-week-grid--day': calendarPeriod === 'day' }" :style="{ '--timeline-days': String(calendarDays.length), '--timeline-day-width': calendarPeriod === 'month' ? '64px' : '88px' }">
        <div class="calendar-corner">{{ t('calendar.apartment') }}</div>
        <div class="calendar-week-headings booking-timeline__headings"><div v-for="day in calendarDays" :key="day" class="calendar-day-heading" :class="{ 'calendar-day-heading--today': isToday(day) }"><span>{{ weekday(day, true) }}</span><strong>{{ dayNumber(day) }}</strong></div></div>
        <template v-for="apartment in visibleApartments" :key="apartment.id">
          <div class="calendar-apartment-label" :style="timelineRowStyle(apartment.id)"><p class="truncate font-semibold">{{ apartment.name }}</p><p class="truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}</p></div>
          <div class="calendar-week-timeline" :style="timelineRowStyle(apartment.id)">
            <div v-for="day in calendarDays" :key="`${apartment.id}-${day}`" class="calendar-slot" :class="{ 'calendar-slot--today': isToday(day) }" />
            <div class="calendar-week-events">
              <StayCalendarPopover
                v-if="!eventsOnly"
                v-for="segment in weekSegmentsForApartment(apartment.id)"
                :key="segment.stay.id"
                :stay="segment.stay"
                :context="segment.hasActualArrival ? 'arrival' : 'stay'"
                :left-label="showGuestDetails ? segment.stay.guestName ?? '' : ''"
                event-class="calendar-stay calendar-stay-bar calendar-week-stay"
                :event-style="{ backgroundColor: 'var(--color-primary)', color: 'var(--color-surface)', ...segmentGrid(segment, segment.lane) }"
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
    <EmptyState v-else-if="bookingView === 'calendar' && calendarLayout === 'timeline' && scopeReady && !staysError" icon="i-lucide-building-2" :title="t('scope.apartmentsLabel')" :description="t('scope.loadErrorDescription')" />

    <div v-else-if="bookingView === 'calendar' && calendarLayout === 'grid' && scopeReady && !staysError" ref="calendarMonthRef" class="calendar-month surface">
      <div class="calendar-month-content">
        <div class="calendar-month-heading"><span v-for="day in monthWeekdayHeadings" :key="day">{{ weekday(day, true) }}</span></div>

        <template v-if="eventsOnly">
          <div v-for="(week, weekIndex) in monthWeeks" :key="`markers-${weekIndex}`" class="calendar-month-week calendar-month-week--markers">
            <div v-for="day in week" :key="day" class="calendar-month-day" :class="{ 'calendar-month-day--muted': !isCurrentMonth(day), 'calendar-month-day--today': isToday(day) }">
              <span class="calendar-month-date">{{ dayNumber(day) }}</span>
              <div class="mt-2 space-y-1">
                <CalendarEventMarker
                  v-for="(marker, markerIndex) in monthMarkerEntries(day)"
                  v-show="isMonthMarkerDayExpanded(day) || markerIndex < 3"
                  :key="`${marker.apartmentId}-${day}`"
                  :marker="marker"
                  class="calendar-month-event"
                  :show-guest-details="showGuestDetails"
                  :show-financial-details="showFinancialDetails"
                  :can-edit="canEditStays"
                  :can-manage-cleaning="user?.roles.includes('administrator')"
                  @edit="openEdit"
                />
                <button
                  v-if="monthMarkerEntries(day).length > 3"
                  type="button"
                  class="calendar-marker-more active:scale-[0.96] transition-transform"
                  :aria-expanded="isMonthMarkerDayExpanded(day)"
                  @click="toggleMonthMarkerDay(day)"
                >
                  {{ isMonthMarkerDayExpanded(day) ? t('common.hide') : `${t('common.more')} ${monthMarkerEntries(day).length - 3}` }}
                </button>
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

    <div v-if="bookingView === 'calendar' && eventsOnly" class="calendar-events-legend" role="list" :aria-label="t('calendar.bookingsAndDepartures')">
      <span class="calendar-events-legend__item" role="listitem"><span class="calendar-events-legend__swatch calendar-events-legend__swatch--arrival" aria-hidden="true" />{{ t('calendar.arrivals') }}</span>
      <span class="calendar-events-legend__item" role="listitem"><span class="calendar-events-legend__swatch calendar-events-legend__swatch--departure" aria-hidden="true" />{{ t('calendar.departures') }}</span>
    </div>

    </div>

    <LazyStayDetailsSlideover v-if="detailsOpen" v-model:open="detailsOpen" :stay="selectedStay" :can-edit="canEditStays" :can-manage-cleaning="Boolean(user?.roles.includes('administrator'))" :show-service-prices="showFinancialDetails" @edit="openEdit" @saved="refreshStayDetails" />

    <USlideover v-model:open="open" :title="editingStay ? t('calendar.editBooking') : t('calendar.newStay')" :modal="true" :overlay="true">
      <template #body>
        <UForm :key="validation.formKey.value" id="stay-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid stay-form-grid" @error="validation.onError" @submit="saveStay">
          <UFormField name="apartmentId" :label="t('calendar.apartment')">
            <ApartmentSelect
              v-model="form.apartmentId"
              :apartments="formApartments"
              :disabled="Boolean(editingStay)"
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

    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('calendar.deleteBooking')" :description="t('calendar.deleteWarning')" :loading="pending" :error="error" @confirm="removeStay" />
  </section>
</template>
