<script setup lang="ts">
import Decimal from 'decimal.js'
import type { Apartment } from '#fsd/entities/apartment'
import type { Stay } from '#fsd/entities/stay'
import type { Hotel } from '#fsd/entities/hotel'
import { apartmentCalendarColor, formatDate, formatEuro } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { DateInput, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import StayCalendarPopover from './StayCalendarPopover.vue'

type CalendarView = 'agenda' | 'week' | 'month'
const user = useCurrentUser()
const hotelId = ref('all')
const calendarView = ref<CalendarView>('week')
const eventsOnly = ref(false)
const cursor = ref(todayKey())
const open = ref(false)
const deleteOpen = ref(false)
const stayToDelete = ref<Stay | null>(null)
const error = ref('')
const pending = ref(false)
const form = reactive({ apartmentId: '', checkInOn: '', checkOutOn: '', adultCount: 1, childCount: 0, sleepingPlacesUsed: 1, specialRequests: '', guestName: '', guestPhone: '', guestComment: '', serviceIds: [] as string[], cashAmountEur: null as number | null })
const showGuestDetails = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const showFinancialDetails = computed(() => Boolean(user.value?.roles.includes('administrator')))

const { data: hotels } = await useAsyncData('calendar-hotels', () => $fetch<Hotel[]>('/api/hotels'), { server: false })
const { data: apartments } = await useAsyncData('calendar-apartments', () => $fetch<Apartment[]>('/api/apartments'), { server: false })
const { data: services } = await useAsyncData('calendar-services', () => $fetch<Array<{ id: string; name: string; priceEur: number; managerSharePercent: number }>>('/api/special-services'), { server: false })
const range = computed(() => calendarRange(calendarView.value, cursor.value))
const { data: stays, status, refresh } = await useAsyncData('calendar-stays', () => $fetch<Stay[]>('/api/stays', { query: { ...(hotelId.value === 'all' ? {} : { hotelId: hotelId.value }), from: range.value.from, to: range.value.to } }), { server: false, watch: [hotelId, range] })
const suggestedCashEur = computed(() => Number((services.value ?? []).filter(service => form.serviceIds.includes(service.id)).reduce((sum, service) => sum.plus(service.priceEur), new Decimal(0)).toDecimalPlaces(2)))
const visibleApartments = computed(() => (apartments.value ?? []).filter(apartment => hotelId.value === 'all' || apartment.hotel.id === hotelId.value))
const weekDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthDays = computed(() => daysBetween(range.value.from, range.value.to))
const monthWeeks = computed(() => Array.from({ length: Math.ceil(monthDays.value.length / 7) }, (_, index) => monthDays.value.slice(index * 7, index * 7 + 7)))
const monthWeekdayHeadings = computed(() => monthWeeks.value[0] ?? [])
const heading = computed(() => calendarView.value === 'month'
  ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Sofia' }).format(dateFromKey(cursor.value))
  : `${formatDate(range.value.from)} — ${formatDate(addDays(range.value.to, -1))}`)

function todayKey() { return new Date().toISOString().slice(0, 10) }
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
function stayOccupies(stay: Stay, day: string) { return stay.checkInOn <= day && stay.checkOutOn > day }
function stayArrives(stay: Stay, day: string) { return stay.checkInOn === day }
function stayDeparts(stay: Stay, day: string) { return stay.checkOutOn === day }
function staysForApartment(apartmentId: string, day: string) { return (stays.value ?? []).filter(stay => stay.apartmentId === apartmentId && stayOccupies(stay, day)) }
function staysForApartmentWeek(apartmentId: string) { return (stays.value ?? []).filter(stay => stay.apartmentId === apartmentId && stay.checkInOn < range.value.to && stay.checkOutOn > range.value.from) }
function arrivalsForApartment(apartmentId: string, day: string) { return (stays.value ?? []).filter(stay => stay.apartmentId === apartmentId && stayArrives(stay, day)) }
function departuresForApartment(apartmentId: string, day: string) { return (stays.value ?? []).filter(stay => stay.apartmentId === apartmentId && stayDeparts(stay, day)) }
function weekColumnStart(value: string) { return value <= range.value.from ? 1 : Math.min(weekDays.value.length, weekDays.value.indexOf(value) + 1) }
function weekColumnEnd(value: string) { return value >= range.value.to ? weekDays.value.length + 1 : Math.min(weekDays.value.length + 1, Math.max(2, weekDays.value.indexOf(value) + 2)) }
function stayWeekGrid(stay: Stay) {
  const start = weekColumnStart(stay.checkInOn < range.value.from ? range.value.from : stay.checkInOn)
  const end = weekColumnEnd(stay.checkOutOn > range.value.to ? range.value.to : stay.checkOutOn)
  const span = Math.max(1, end - start)
  return { gridColumn: `${start} / ${Math.max(start + 1, end)}`, '--stay-span': String(span) }
}
function weekMarkerGrid(value: string) { return { gridColumn: `${weekColumnStart(value)} / span 1` } }
function monthEntries(day: string) { return (stays.value ?? []).filter(stay => eventsOnly.value ? stayArrives(stay, day) || stayDeparts(stay, day) : stayOccupies(stay, day) || stayDeparts(stay, day)) }
function monthEntryLabel(stay: Stay, day: string) {
  if (eventsOnly.value) return `${stayArrives(stay, day) ? 'Заезд' : 'Выезд'} · ${stay.apartment.name}`
  return stayDeparts(stay, day) ? `Выезд · ${stay.apartment.name}` : stay.apartment.name
}
function eventStyle(stay: Stay) { const color = apartmentCalendarColor(stay.apartmentId); return { backgroundColor: color.background, color: color.foreground, '--departure-color': color.departure } }
function shift(direction: number) { cursor.value = addDays(cursor.value, direction * (calendarView.value === 'month' ? 31 : 7)) }
function goToday() { cursor.value = todayKey() }
function openDelete(stay: Stay) { stayToDelete.value = stay; deleteOpen.value = true; error.value = '' }
async function removeStay() { if (!stayToDelete.value) return; pending.value = true; error.value = ''; try { await $fetch(`/api/stays/${stayToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; stayToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось удалить заезд' } finally { pending.value = false } }
async function create() { pending.value = true; error.value = ''; try { await $fetch('/api/stays', { method: 'POST', body: form }); open.value = false; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось добавить заезд' } finally { pending.value = false } }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Заезды" description="Календарь занятости апартаментов.">
      <template #actions><UButton icon="i-lucide-plus" @click="open = true">Новый заезд</UButton></template>
    </PageHeader>

    <div class="calendar-controls surface">
      <div class="flex flex-wrap items-center gap-2">
        <UButton color="neutral" variant="ghost" @click="goToday">Сегодня</UButton>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Предыдущий период" @click="shift(-1)" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Следующий период" @click="shift(1)" />
        <p class="calendar-range-title">{{ heading }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="hotelId" :items="[{ label: 'Все отели', value: 'all' }, ...(hotels ?? []).map(hotel => ({ label: hotel.name, value: hotel.id }))]" class="w-full sm:w-60" />
        <UButton :variant="eventsOnly ? 'solid' : 'soft'" color="primary" icon="i-lucide-arrow-left-right" class="min-h-11 active:scale-[0.96] transition-transform" @click="eventsOnly = !eventsOnly">{{ eventsOnly ? 'Заезды и выезды' : 'Проживания' }}</UButton>
        <UFieldGroup><UButton :variant="calendarView === 'agenda' ? 'solid' : 'soft'" @click="calendarView = 'agenda'">Список</UButton><UButton :variant="calendarView === 'week' ? 'solid' : 'soft'" @click="calendarView = 'week'">Неделя</UButton><UButton :variant="calendarView === 'month' ? 'solid' : 'soft'" @click="calendarView = 'month'">Месяц</UButton></UFieldGroup>
      </div>
    </div>

    <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 6" :key="item" class="h-20 rounded-2xl" /></div>

    <div v-else-if="calendarView === 'agenda' && stays?.length" class="surface divide-y divide-[var(--color-line)] px-5 sm:px-6">
      <article v-for="stay in stays" :key="stay.id" class="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-1 items-start gap-4"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-calendar-range" class="size-5" /></div><div class="min-w-0"><p class="truncate font-semibold">{{ stay.apartment.name }} <span class="font-normal text-[var(--color-muted)]">· {{ stay.apartment.hotel.name }}</span></p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</p><p class="mt-1 text-sm">{{ stay.adultCount + stay.childCount }} гостей · {{ stay.adultCount }} взрослых</p></div></div>
        <UButton v-if="user?.roles.includes('administrator')" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="openDelete(stay)">Удалить</UButton>
      </article>
    </div>
    <EmptyState v-else-if="calendarView === 'agenda'" icon="i-lucide-calendar-plus" title="Заездов в этом периоде нет" description="Создайте первый заезд — уборка появится автоматически."><template #actions><UButton @click="open = true">Новый заезд</UButton></template></EmptyState>

    <div v-else-if="calendarView === 'week' && visibleApartments.length" class="calendar-board surface">
      <div class="calendar-week-grid">
        <div class="calendar-corner">Апартамент</div>
        <div class="calendar-week-headings"><div v-for="day in weekDays" :key="day" class="calendar-day-heading" :class="{ 'calendar-day-heading--today': isToday(day) }"><span>{{ weekday(day, true) }}</span><strong>{{ dayNumber(day) }}</strong></div></div>
        <template v-for="apartment in visibleApartments" :key="apartment.id">
          <div class="calendar-apartment-label"><p class="truncate font-semibold">{{ apartment.name }}</p><p class="truncate text-xs text-[var(--color-muted)]">{{ apartment.hotel.name }}</p></div>
          <div class="calendar-week-timeline">
            <div v-for="day in weekDays" :key="`${apartment.id}-${day}`" class="calendar-slot" :class="{ 'calendar-slot--today': isToday(day) }" />
            <div class="calendar-week-events">
              <StayCalendarPopover v-if="!eventsOnly" v-for="stay in staysForApartmentWeek(apartment.id)" :key="stay.id" :stay="stay" :context="stay.checkInOn >= range.from ? 'arrival' : 'stay'" :label="stay.checkInOn >= range.from ? stay.apartment.name : ''" event-class="calendar-stay" :event-style="{ ...eventStyle(stay), ...stayWeekGrid(stay) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" />
              <template v-else>
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkInOn >= range.from && item.checkInOn < range.to)" :key="`${stay.id}-arrival`" :stay="stay" context="arrival" label="Заезд" event-class="calendar-arrival calendar-week-marker calendar-week-arrival" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkInOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" />
                <StayCalendarPopover v-for="stay in staysForApartmentWeek(apartment.id).filter(item => item.checkOutOn >= range.from && item.checkOutOn < range.to)" :key="`${stay.id}-departure`" :stay="stay" context="departure" label="Выезд" event-class="calendar-departure calendar-week-marker calendar-week-departure" :event-style="{ ...eventStyle(stay), ...weekMarkerGrid(stay.checkOutOn) }" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" />
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
    <EmptyState v-else-if="calendarView === 'week'" icon="i-lucide-building-2" title="Нет доступных апартаментов" description="Выберите другой отель или добавьте апартамент." />

    <div v-else-if="calendarView === 'month'" class="calendar-month surface">
      <div class="calendar-month-heading"><span v-for="day in monthWeekdayHeadings" :key="day">{{ weekday(day, true) }}</span></div>
      <div v-for="(week, weekIndex) in monthWeeks" :key="weekIndex" class="calendar-month-week">
        <div v-for="day in week" :key="day" class="calendar-month-day" :class="{ 'calendar-month-day--muted': !isCurrentMonth(day), 'calendar-month-day--today': isToday(day) }"><span class="calendar-month-date">{{ dayNumber(day) }}</span><div class="mt-2 space-y-1"><StayCalendarPopover v-for="stay in monthEntries(day).slice(0, 3)" :key="`${stay.id}-${day}`" :stay="stay" :context="stayDeparts(stay, day) ? 'departure' : stayArrives(stay, day) ? 'arrival' : 'stay'" :label="monthEntryLabel(stay, day)" event-class="calendar-month-event" :event-style="eventStyle(stay)" :show-guest-details="showGuestDetails" :show-financial-details="showFinancialDetails" /><span v-if="monthEntries(day).length > 3" class="calendar-more">Ещё {{ monthEntries(day).length - 3 }}</span></div></div>
      </div>
    </div>

    <USlideover v-model:open="open" title="Новый заезд"><template #body><form class="form-grid" @submit.prevent="create"><UFormField label="Апартамент"><USelect v-model="form.apartmentId" :items="visibleApartments.map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))" class="w-full" required /></UFormField><div class="grid gap-4 sm:grid-cols-2"><UFormField label="Дата заезда"><DateInput v-model="form.checkInOn" required /></UFormField><UFormField label="Дата выезда"><DateInput v-model="form.checkOutOn" required /></UFormField></div><p class="text-sm text-[var(--color-muted)]">День выезда свободен для нового заезда.</p><div class="grid grid-cols-3 gap-3"><UFormField label="Взрослые"><UInput v-model.number="form.adultCount" type="number" min="1" /></UFormField><UFormField label="Дети"><UInput v-model.number="form.childCount" type="number" min="0" /></UFormField><UFormField label="Спальные места"><UInput v-model.number="form.sleepingPlacesUsed" type="number" min="0" /></UFormField></div><USeparator /><UFormField label="Имя гостя"><UInput v-model="form.guestName" /></UFormField><UFormField label="Телефон гостя"><UInput v-model="form.guestPhone" type="tel" /></UFormField><UFormField label="Комментарий гостя"><UTextarea v-model="form.guestComment" /></UFormField><UFormField label="Особые пожелания"><UTextarea v-model="form.specialRequests" /></UFormField><div v-if="services?.length" class="rounded-xl bg-[#f4f8f6] p-4"><p class="font-semibold">Дополнительные услуги</p><label v-for="service in services" :key="service.id" class="mt-3 flex min-h-11 items-center justify-between gap-3 text-sm"><span class="flex items-center gap-3"><UCheckbox v-model="form.serviceIds" :value="service.id" />{{ service.name }}</span><span class="font-semibold tabular-nums">{{ formatEuro(service.priceEur) }}</span></label><p class="mt-3 text-sm text-[var(--color-muted)]">Рекомендуемая наличная сумма: <strong class="text-[var(--color-ink)]">{{ formatEuro(suggestedCashEur) }}</strong></p></div><UFormField label="Наличные при заезде" help="Если оставить пустым, будет использована сумма выбранных услуг."><MoneyInput v-model="form.cashAmountEur" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton type="submit" :loading="pending">Создать заезд</UButton></div></form></template></USlideover>

    <UModal v-model:open="deleteOpen" title="Удалить заезд"><template #body><div class="space-y-5"><p>Заезд, уборка, услуги, финансовые записи и списанные расходники будут удалены. Расходники вернутся в остатки.</p><UAlert color="error" variant="soft" title="Это действие нельзя отменить." /><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="deleteOpen = false">Отмена</UButton><UButton color="error" :loading="pending" @click="removeStay">Удалить навсегда</UButton></div></div></template></UModal>
  </section>
</template>
