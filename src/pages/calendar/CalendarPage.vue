<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import type { Hotel } from '#fsd/entities/hotel'
import type { DateValue } from '@internationalized/date'
import { filterApartmentsByScope, isPropertyScopeReady, propertyScopeQuery, PropertyScopeFilter, type PropertyScopeValue } from '#fsd/features/select-property-scope'
import { apartmentCalendarColor, formatDate, formatEuro } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { DateRangeInput, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import StayCalendarPopover from './StayCalendarPopover.vue'
import { assignMonthWeekLanes, createWeekSegments, type CalendarStaySegment } from './model/calendar-timeline'
import { createStayAgenda, stayAgendaQueryFrom, type StayAgendaStatus } from './model/stay-agenda'
import { stayCleaningHref, stayCleaningPresentation } from './model/stay-cleaning'

type CalendarView = 'agenda' | 'week' | 'month'
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
type SpecialServiceOption = { id: string; name: string; priceEur: number; managerSharePercent: number; active: boolean }

function emptyStayForm(): StayForm {
  return { apartmentId: '', checkInOn: '', checkOutOn: '', adultCount: 1, childCount: 0, specialRequests: '', guestName: '', guestPhone: '', guestComment: '', serviceIds: [], cashAmountEur: null }
}

const user = useCurrentUser()
const propertyScope = reactive<PropertyScopeValue>({ scope: 'all', hotelId: 'all', apartmentIds: [] })
const calendarViewStorageKey = 'aparts.calendar.view'
const calendarView = ref<CalendarView>('agenda')
const eventsOnly = ref(false)
const cursor = ref(todayKey())
const open = ref(false)
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
const range = computed(() => calendarRange(calendarView.value, cursor.value))
const selectedScope = computed<PropertyScopeValue>(() => ({ ...propertyScope, apartmentIds: [...propertyScope.apartmentIds] }))
const scopeReady = computed(() => isPropertyScopeReady(selectedScope.value))
const stayQuery = computed(() => ({
  ...propertyScopeQuery(selectedScope.value),
  ...(calendarView.value === 'agenda'
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
      priceEur: selected.priceEurSnapshot,
      managerSharePercent: selected.managerSharePercentSnapshot,
      active: current?.active ?? false
    })
  }
  return [...available.values()]
})
const visibleApartments = computed(() => filterApartmentsByScope(apartments.value ?? [], selectedScope.value))
const weekDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthWeeks = computed(() => Array.from({ length: Math.ceil(monthDays.value.length / 7) }, (_, index) => monthDays.value.slice(index * 7, index * 7 + 7)))
const monthWeekdayHeadings = computed(() => monthWeeks.value[0] ?? [])
const agendaDays = computed(() => createStayAgenda(stays.value ?? [], todayKey()))
const monthWeekLayouts = computed(() => assignMonthWeekLanes(
  stays.value ?? [],
  monthWeeks.value.filter(week => week.length).map(week => ({ from: week[0]!, to: addDays(week[0]!, 7) }))
))
const heading = computed(() => calendarView.value === 'month'
  ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Sofia' }).format(dateFromKey(cursor.value))
  : `${formatDate(range.value.from)} — ${formatDate(addDays(range.value.to, -1))}`)

onMounted(() => {
  const storedView = localStorage.getItem(calendarViewStorageKey)
  if (storedView === 'agenda' || storedView === 'week' || storedView === 'month') calendarView.value = storedView
})

watch(calendarView, value => {
  if (import.meta.client) localStorage.setItem(calendarViewStorageKey, value)
})

watch(visibleApartments, value => {
  if (form.apartmentId && !value.some(apartment => apartment.id === form.apartmentId)) form.apartmentId = ''
})

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Sofia' }).format(new Date())
}
function dateFromKey(value: string) { return new Date(`${value}T12:00:00Z`) }
function keyFromDate(value: Date) { return value.toISOString().slice(0, 10) }
function addDays(value: string, amount: number) { const date = dateFromKey(value); date.setUTCDate(date.getUTCDate() + amount); return keyFromDate(date) }
function weekStart(value: string) { const date = dateFromKey(value); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return keyFromDate(date) }
function daysBetween(from: string, to: string) { const days: string[] = []; for (let day = from; day < to; day = addDays(day, 1)) days.push(day); return days }
function calendarRange(view: CalendarView, value: string) {
  if (view === 'month') {
    const date = dateFromKey(value)
    const first = keyFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
    const from = weekStart(first)
    return { from, to: addDays(from, 42) }
  }
  const from = weekStart(value)
  return { from, to: addDays(from, 7) }
}
function isToday(day: string) { return day === todayKey() }
function isCurrentMonth(day: string) { const current = dateFromKey(cursor.value); const date = dateFromKey(day); return current.getUTCMonth() === date.getUTCMonth() && current.getUTCFullYear() === date.getUTCFullYear() }
function weekday(day: string, short = false) { return new Intl.DateTimeFormat('ru-RU', { weekday: short ? 'short' : 'long', timeZone: 'Europe/Sofia' }).format(dateFromKey(day)) }
function dayNumber(day: string) { return dateFromKey(day).getUTCDate() }
function stayArrives(stay: Stay, day: string) { return stay.checkInOn === day }
function stayDeparts(stay: Stay, day: string) { return stay.checkOutOn === day }
function staysForApartmentWeek(apartmentId: string) { return (stays.value ?? []).filter(stay => stay.apartmentId === apartmentId && stay.checkInOn < range.value.to && stay.checkOutOn >= range.value.from) }
function weekSegmentsForApartment(apartmentId: string) { return createWeekSegments(staysForApartmentWeek(apartmentId), range.value.from, range.value.to) }
function isStayDateDisabled(date: DateValue) {
  if (!form.apartmentId) return false
  const day = date.toString()
  const selectedStart = form.checkInOn
  return (stays.value ?? [])
    .filter(stay => stay.apartmentId === form.apartmentId && stay.id !== editingStay.value?.id)
    .some(stay => selectedStart
      ? day > stay.checkInOn && day < stay.checkOutOn
      : day >= stay.checkInOn && day < stay.checkOutOn)
}
function segmentGrid(segment: CalendarStaySegment<Stay>, lane?: number) { return { gridColumn: `${segment.startHalf + 1} / ${segment.endHalf + 1}`, ...(lane === undefined ? {} : { gridRow: String(lane + 1) }) } }
function weekMarkerGrid(value: string) { const dayIndex = weekDays.value.indexOf(value); return { gridColumn: `${dayIndex * 2 + 1} / span 2` } }
function monthMarkerEntries(day: string) { return (stays.value ?? []).filter(stay => stayArrives(stay, day) || stayDeparts(stay, day)) }
function monthMarkerLabel(stay: Stay, day: string) { return `${stayArrives(stay, day) ? 'Заезд' : 'Выезд'} · ${stay.apartment.name}` }
function agendaDateLabel(day: string) {
  const today = todayKey()
  const tomorrow = addDays(today, 1)
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' as const }),
    timeZone: 'Europe/Sofia'
  }).format(dateFromKey(day))
  if (day === today) return `Сегодня, ${formatted.replace(/^./, letter => letter.toLowerCase())}`
  if (day === tomorrow) return `Завтра, ${formatted.replace(/^./, letter => letter.toLowerCase())}`
  return formatted.replace(/^./, letter => letter.toUpperCase())
}
function agendaCategory(status: StayAgendaStatus) {
  return {
    departure: { label: 'Выезды', emptyLabel: 'Выездов нет', icon: 'i-lucide-log-out' },
    arrival: { label: 'Заезды', emptyLabel: 'Заездов нет', icon: 'i-lucide-log-in' },
    staying: { label: 'Продолжает проживать', emptyLabel: 'Продолжающих проживать нет', icon: 'i-lucide-house' }
  }[status]
}
function agendaEventCount(count: number) {
  const mod100 = count % 100
  const mod10 = count % 10
  const word = mod100 >= 11 && mod100 <= 14 ? 'событий' : mod10 === 1 ? 'событие' : mod10 >= 2 && mod10 <= 4 ? 'события' : 'событий'
  return `${count} ${word}`
}
function agendaGuestLabel(stay: Stay) {
  const count = stay.adultCount + stay.childCount
  const mod100 = count % 100
  const mod10 = count % 10
  const word = mod100 >= 11 && mod100 <= 14 ? 'гостей' : mod10 === 1 ? 'гость' : mod10 >= 2 && mod10 <= 4 ? 'гостя' : 'гостей'
  return [stay.guestName, `${count} ${word}`].filter(Boolean).join(' · ')
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
function cleaningPresentation(stay: Stay) { return stayCleaningPresentation(stay) }
function cleaningHref(stay: Stay) { return stayCleaningHref(stay) }
function shift(direction: number) { cursor.value = addDays(cursor.value, direction * (calendarView.value === 'month' ? 31 : 7)) }
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
function setServiceSelected(serviceId: string, selected: boolean | 'indeterminate') {
  if (selected === true) {
    if (!form.serviceIds.includes(serviceId)) form.serviceIds.push(serviceId)
    return
  }
  form.serviceIds = form.serviceIds.filter(id => id !== serviceId)
}
function openDelete(stay: Stay) { stayToDelete.value = stay; deleteOpen.value = true; error.value = '' }
async function removeStay() { if (!stayToDelete.value) return; pending.value = true; error.value = ''; try { await $fetch(`/api/stays/${stayToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; stayToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось удалить заезд' } finally { pending.value = false } }
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
    error.value = cause?.data?.statusMessage ?? `Не удалось ${editingStay.value ? 'изменить' : 'добавить'} заезд`
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Заезды" description="Календарь занятости апартаментов.">
      <template #actions><UButton icon="i-lucide-plus" @click="openCreate">Новый заезд</UButton></template>
    </PageHeader>

    <div class="calendar-controls surface">
      <div class="calendar-controls__top">
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="calendarView !== 'agenda'">
            <UButton color="neutral" variant="ghost" @click="goToday">Сегодня</UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Предыдущий период" @click="shift(-1)" />
            <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Следующий период" @click="shift(1)" />
            <p class="calendar-range-title">{{ heading }}</p>
          </template>
          <div v-else class="calendar-agenda-intro">
            <span class="calendar-agenda-intro__icon"><UIcon name="i-lucide-calendar-clock" class="size-5" /></span>
            <div><p class="font-semibold">Сегодня и далее</p><p>Ежедневные заезды, выезды и проживания</p></div>
          </div>
        </div>
        <div class="calendar-controls__views">
          <UButton v-if="calendarView !== 'agenda'" :variant="eventsOnly ? 'solid' : 'soft'" color="primary" icon="i-lucide-arrow-left-right" class="calendar-events-toggle min-h-11 active:scale-[0.96] transition-transform" @click="eventsOnly = !eventsOnly">{{ eventsOnly ? 'Заезды и выезды' : 'Проживания' }}</UButton>
          <UFieldGroup class="calendar-view-switch"><UButton :variant="calendarView === 'agenda' ? 'solid' : 'soft'" @click="calendarView = 'agenda'">По датам</UButton><UButton :variant="calendarView === 'week' ? 'solid' : 'soft'" @click="calendarView = 'week'">Неделя</UButton><UButton :variant="calendarView === 'month' ? 'solid' : 'soft'" @click="calendarView = 'month'">Месяц</UButton></UFieldGroup>
        </div>
      </div>
      <PropertyScopeFilter
        v-model:scope="propertyScope.scope"
        v-model:hotel-id="propertyScope.hotelId"
        v-model:apartment-ids="propertyScope.apartmentIds"
        :hotels="hotels ?? []"
        :apartments="apartments ?? []"
        :apartments-error="Boolean(apartmentsError)"
        scope-label="Показывать"
        class="calendar-controls__scope"
      />
    </div>

    <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 6" :key="item" class="h-20 rounded-2xl" /></div>

    <EmptyState v-else-if="!scopeReady" icon="i-lucide-list-filter" title="Выберите область календаря" :description="propertyScope.scope === 'hotel' ? 'Выберите апарт-отель, чтобы показать его заезды.' : 'Выберите хотя бы один апартамент, чтобы показать его заезды.'" />

    <div v-else-if="calendarView === 'agenda' && agendaDays.length" class="stay-agenda">
      <UCollapsible v-for="day in agendaDays" :key="day.date" as="section" :default-open="true" class="stay-agenda-day surface">
        <template #default="{ open }">
          <button type="button" class="stay-agenda-day__header">
            <div><h2>{{ agendaDateLabel(day.date) }}</h2><p>{{ agendaEventCount(day.totalCount) }}</p></div>
            <div class="stay-agenda-day__controls">
              <div class="stay-agenda-day__summary" aria-label="Сводка за день">
                <span class="stay-agenda-count stay-agenda-count--departure" :aria-label="`Выездов: ${day.counts.departure}`"><UIcon name="i-lucide-log-out" class="size-3.5" />{{ day.counts.departure }}</span>
                <span class="stay-agenda-count stay-agenda-count--arrival" :aria-label="`Заездов: ${day.counts.arrival}`"><UIcon name="i-lucide-log-in" class="size-3.5" />{{ day.counts.arrival }}</span>
                <span class="stay-agenda-count stay-agenda-count--staying" :aria-label="`Продолжают проживать: ${day.counts.staying}`"><UIcon name="i-lucide-house" class="size-3.5" />{{ day.counts.staying }}</span>
              </div>
              <span class="stay-agenda-day__chevron" :class="{ 'stay-agenda-day__chevron--open': open }" aria-hidden="true"><UIcon name="i-lucide-chevron-down" class="size-5" /></span>
            </div>
          </button>
        </template>
        <template #content>
          <div class="stay-agenda-day__content">
            <section v-for="category in day.categories" :key="category.status" class="stay-agenda-category" :class="`stay-agenda-category--${category.status}`">
              <header class="stay-agenda-category__header">
                <span class="stay-agenda-category__icon"><UIcon :name="agendaCategory(category.status).icon" class="size-5" /></span>
                <h3>{{ agendaCategory(category.status).label }}</h3>
                <span class="stay-agenda-category__count">{{ category.items.length }}</span>
              </header>
              <p v-if="!category.items.length" class="stay-agenda-category__empty">{{ agendaCategory(category.status).emptyLabel }}</p>
              <div v-else class="stay-agenda-category__items">
                <article v-for="item in category.items" :key="`${day.date}-${item.stay.id}-${item.status}`" class="stay-agenda-item">
                  <div class="stay-agenda-item__content">
                    <p class="stay-agenda-item__apartment">{{ item.stay.apartment.name }} <span>· {{ item.stay.apartment.hotel.name }}</span></p>
                    <p class="stay-agenda-item__meta"><span>{{ agendaGuestLabel(item.stay) }}</span><span>{{ formatDate(item.stay.checkInOn) }} → {{ formatDate(item.stay.checkOutOn) }}</span></p>
                  </div>
                  <div class="stay-agenda-item__actions">
                    <NuxtLink v-if="user?.roles.includes('administrator')" :to="cleaningHref(item.stay)" class="stay-cleaning-indicator" :class="cleaningPresentation(item.stay).className" :title="cleaningPresentation(item.stay).label" :aria-label="cleaningPresentation(item.stay).label"><UIcon :name="cleaningPresentation(item.stay).icon" class="size-4" /></NuxtLink>
                    <span v-else class="stay-cleaning-indicator" :class="cleaningPresentation(item.stay).className" :title="cleaningPresentation(item.stay).label" role="img" :aria-label="cleaningPresentation(item.stay).label"><UIcon :name="cleaningPresentation(item.stay).icon" class="size-4" /></span>
                    <UButton v-if="canEditStays" color="neutral" variant="ghost" icon="i-lucide-pencil" class="stay-agenda-action" :aria-label="`Изменить заезд ${item.stay.apartment.name}`" @click="openEdit(item.stay)" />
                    <UButton v-if="user?.roles.includes('administrator')" color="error" variant="ghost" icon="i-lucide-trash-2" class="stay-agenda-action" :aria-label="`Удалить заезд ${item.stay.apartment.name}`" @click="openDelete(item.stay)" />
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>
      </UCollapsible>
    </div>
    <EmptyState v-else-if="calendarView === 'agenda'" icon="i-lucide-calendar-check-2" title="Событий с сегодняшнего дня нет" description="Нет текущих или будущих заездов."><template #actions><UButton @click="openCreate">Новый заезд</UButton></template></EmptyState>

    <div v-else-if="calendarView === 'week' && visibleApartments.length" class="calendar-board surface">
      <div class="calendar-week-grid">
        <div class="calendar-corner">Апартамент</div>
        <div class="calendar-week-headings"><div v-for="day in weekDays" :key="day" class="calendar-day-heading" :class="{ 'calendar-day-heading--today': isToday(day) }"><span>{{ weekday(day, true) }}</span><strong>{{ dayNumber(day) }}</strong></div></div>
        <template v-for="apartment in visibleApartments" :key="apartment.id">
          <div class="calendar-apartment-label"><p class="truncate font-semibold">{{ apartment.name }}</p><p class="truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}</p></div>
          <div class="calendar-week-timeline">
            <div v-for="day in weekDays" :key="`${apartment.id}-${day}`" class="calendar-slot" :class="{ 'calendar-slot--today': isToday(day) }" />
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
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkInOn >= range.from && item.checkInOn < range.to)" :key="`${stay.id}-arrival`" :stay="stay" context="arrival" left-label="Заезд" event-class="calendar-arrival calendar-week-marker calendar-week-arrival" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkInOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" :can-edit="canEditStays" :can-manage-cleaning="user?.roles.includes('administrator')" @edit="openEdit" />
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkOutOn >= range.from && item.checkOutOn < range.to)" :key="`${stay.id}-departure`" :stay="stay" context="departure" left-label="Выезд" event-class="calendar-departure calendar-week-marker calendar-week-departure" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkOutOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" :can-edit="canEditStays" :can-manage-cleaning="user?.roles.includes('administrator')" @edit="openEdit" />
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
    <EmptyState v-else-if="calendarView === 'week'" icon="i-lucide-building-2" title="Нет доступных апартаментов" description="Выберите другой отель или добавьте апартамент." />

    <div v-else-if="calendarView === 'month'" class="calendar-month surface">
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
                <span v-if="monthMarkerEntries(day).length > 3" class="calendar-marker-more">Ещё {{ monthMarkerEntries(day).length - 3 }}</span>
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
                {{ isMonthWeekExpanded(layout.key) ? 'Свернуть' : `Ещё ${layout.hiddenStayCount}` }}
              </button>
            </div>
          </section>
        </template>
      </div>
    </div>

    <USlideover v-model:open="open" :title="editingStay ? 'Изменить заезд' : 'Новый заезд'">
      <template #body>
        <form class="form-grid stay-form-grid" @submit.prevent="saveStay">
          <UFormField label="Апартамент">
            <USelect
              v-model="form.apartmentId"
              :items="visibleApartments.map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))"
              :disabled="Boolean(editingStay)"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField label="Период проживания"><DateRangeInput v-model:start="form.checkInOn" v-model:end="form.checkOutOn" :is-date-disabled="isStayDateDisabled" required /></UFormField>
          <p class="text-sm text-[var(--color-muted)]">День выезда свободен для нового заезда.</p>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Взрослые"><UInput v-model.number="form.adultCount" type="number" min="1" /></UFormField>
            <UFormField label="Дети"><UInput v-model.number="form.childCount" type="number" min="0" /></UFormField>
          </div>
          <USeparator />
          <UFormField label="Комментарий"><UTextarea v-model="form.guestComment" class="w-full" /></UFormField>
          <div v-if="formServices.length" class="rounded-xl bg-[#f4f8f6] px-0 py-1">
            <p class="font-semibold">Дополнительные услуги</p>
            <label v-for="service in formServices" :key="service.id" class="mt-1 flex min-h-11 items-center justify-between gap-3 text-sm">
              <span class="flex items-center gap-3">
                <UCheckbox :model-value="form.serviceIds.includes(service.id)" :value="service.id" @update:model-value="setServiceSelected(service.id, $event)" />
                <span>{{ service.name }} <span v-if="!service.active" class="text-[var(--color-muted)]">(недоступна для новых заездов)</span></span>
              </span>
              <span class="font-semibold tabular-nums">{{ formatEuro(service.priceEur) }}</span>
            </label>
          </div>
          <UFormField label="Наличные при заезде"><MoneyInput v-model="form.cashAmountEur" /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
          <div class="form-actions">
            <UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton>
            <UButton type="submit" :loading="pending">{{ editingStay ? 'Сохранить изменения' : 'Создать заезд' }}</UButton>
          </div>
        </form>
      </template>
    </USlideover>

    <UModal v-model:open="deleteOpen" title="Удалить заезд"><template #body><div class="space-y-5"><p>Заезд, уборка, услуги, финансовые записи и списанные расходники будут удалены. Расходники вернутся в остатки.</p><UAlert color="error" variant="soft" title="Это действие нельзя отменить." /><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="deleteOpen = false">Отмена</UButton><UButton color="error" :loading="pending" @click="removeStay">Удалить навсегда</UButton></div></div></template></UModal>
  </section>
</template>
