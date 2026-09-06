<script setup lang="ts">
import Decimal from 'decimal.js'
import type { Cleaning } from '#fsd/entities/cleaning'
import type { Stay } from '#fsd/entities/stay'
import type { Task } from '#fsd/entities/task'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { canAccessWorkSection, useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, MetricTile, StatusBadge } from '#fsd/shared/ui'
import { activeCleaning, activeTask, currentDashboardMonth, dashboardMonthLabel, dateInDashboardMonth, isDashboardMonth, problemDashboardRecord, shiftDashboardMonth, sortDashboardRecords, stayInDashboardMonth, undatedDashboardRecord } from './model/dashboard-month'
import { useI18n } from 'vue-i18n'

const currentUser = useCurrentUser()
const { t, locale } = useI18n()
const isAdministrator = computed(() => Boolean(currentUser.value?.roles.includes('administrator')))
const isWorkerView = computed(() => Boolean(currentUser.value?.roles.includes('cleaner') && !isAdministrator.value))
const canViewWork = computed(() => canAccessWorkSection(currentUser.value))
const [{ data: stays, status: staysStatus }, { data: cleanings }, { data: tasks }] = await Promise.all([
  useAsyncData('dashboard-stays', () => $fetch<Stay[]>('/api/stays'), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('dashboard-cleanings', () => canViewWork.value ? $fetch<Cleaning[]>('/api/cleanings') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser, canViewWork] }),
  useAsyncData('dashboard-tasks', () => canViewWork.value ? $fetch<Task[]>('/api/tasks') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser, canViewWork] })
])
const dashboardMonth = ref(currentDashboardMonth())
const monthLabel = computed(() => {
  const label = dashboardMonthLabel(dashboardMonth.value, locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU')
  return label.charAt(0).toUpperCase() + label.slice(1)
})
const currentMonth = computed(() => currentDashboardMonth())
const monthStorageKey = 'aparts.dashboard.month'
const upcoming = computed(() => (stays.value ?? []).filter(stay => stayInDashboardMonth(stay, dashboardMonth.value)).sort((left, right) => {
  const leftDate = dateInDashboardMonth(left.checkInOn, dashboardMonth.value) ? left.checkInOn : left.checkOutOn
  const rightDate = dateInDashboardMonth(right.checkInOn, dashboardMonth.value) ? right.checkInOn : right.checkOutOn
  return leftDate.localeCompare(rightDate)
}).slice(0, 5))
const openCleanings = computed(() => sortDashboardRecords((cleanings.value ?? []).filter(item => activeCleaning(item.status) && dateInDashboardMonth(item.scheduledOn, dashboardMonth.value))))
const openTasks = computed(() => sortDashboardRecords((tasks.value ?? []).filter(item => activeTask(item.status) && dateInDashboardMonth(item.dueOn, dashboardMonth.value))))
const problems = computed(() => sortDashboardRecords([
  ...(cleanings.value ?? []).filter(item => problemDashboardRecord(item, dashboardMonth.value)),
  ...(tasks.value ?? []).filter(item => problemDashboardRecord(item, dashboardMonth.value))
]))
const undatedWork = computed(() => sortDashboardRecords([
  ...(tasks.value ?? []).filter(item => (activeTask(item.status) || item.hasProblem) && undatedDashboardRecord(item))
]))
function problemCount(item: Cleaning | Task) { return 'problems' in item ? item.problems.length : item.hasProblem ? 1 : 0 }
const dashboardProblemCount = computed(() => problems.value.reduce((count, item) => count + problemCount(item), 0) + undatedWork.value.reduce((count, item) => count + problemCount(item), 0))
const cleanerPool = computed(() => Number(openCleanings.value.reduce((sum, item) => sum.plus(item.tariffSnapshot.cleanerPoolEur ?? 0), new Decimal(0)).toDecimalPlaces(2)))
const statusLabel = computed<Record<string, string>>(() => ({ unassigned: t('work.statusUnassigned'), assigned: t('work.statusAssigned'), in_progress: t('work.statusProgress'), open: t('work.statusOpen') }))

if (import.meta.client) {
  const storedMonth = sessionStorage.getItem(monthStorageKey)
  if (isDashboardMonth(storedMonth)) dashboardMonth.value = storedMonth
}

watch(dashboardMonth, value => {
  if (import.meta.client) sessionStorage.setItem(monthStorageKey, value)
})
function shiftMonth(amount: number) { dashboardMonth.value = shiftDashboardMonth(dashboardMonth.value, amount) }
function resetMonth() { dashboardMonth.value = currentMonth.value }
function dashboardWorkHref(work: Cleaning | Task) { return 'title' in work ? `/tasks/${encodeURIComponent(work.id)}` : `/cleanings/${encodeURIComponent(work.id)}` }
</script>

<template>
  <section class="page-wrap space-y-6">
    <div class="dashboard-page-header">
      <div class="dashboard-page-header__actions">
        <div class="dashboard-month-control" :aria-label="t('dashboard.monthPicker')">
          <UButton color="neutral" variant="soft" icon="i-lucide-chevron-left" :aria-label="t('dashboard.previousMonth')" @click="shiftMonth(-1)" />
          <span class="dashboard-month-control__label">{{ monthLabel }}</span>
          <UButton color="neutral" variant="soft" icon="i-lucide-chevron-right" :aria-label="t('dashboard.nextMonth')" @click="shiftMonth(1)" />
          <UButton v-if="dashboardMonth !== currentMonth" color="neutral" variant="ghost" @click="resetMonth">{{ t('dashboard.currentMonth') }}</UButton>
        </div>
        <UButton v-if="!isAdministrator && !isWorkerView" to="/calendar" icon="i-lucide-plus">{{ t('dashboard.newBooking') }}</UButton>
      </div>
    </div>

    <div v-if="staysStatus === 'pending'" class="grid" :class="isWorkerView ? 'dashboard-worker-metrics' : 'grid-cols-2 gap-3 lg:grid-cols-4'">
      <USkeleton v-for="item in isWorkerView ? 3 : 4" :key="item" class="h-28 rounded-2xl" />
    </div>
    <div v-else class="grid" :class="isWorkerView ? 'dashboard-worker-metrics' : 'grid-cols-2 gap-3 lg:grid-cols-4'">
      <NuxtLink v-if="!isWorkerView" to="/calendar" class="dashboard-metric-link"><MetricTile :label="t('dashboard.bookings')" :value="upcoming.length" icon="i-lucide-log-in" /></NuxtLink>
      <NuxtLink v-if="canViewWork" to="/work" class="dashboard-metric-link"><MetricTile :label="t('dashboard.cleanings')" :value="openCleanings.length" icon="i-lucide-broom" /></NuxtLink>
      <NuxtLink v-if="canViewWork" to="/work" class="dashboard-metric-link"><MetricTile :label="t('dashboard.tasks')" :value="openTasks.length" icon="i-lucide-clipboard-check" /></NuxtLink>
      <NuxtLink v-if="isAdministrator" to="/work" class="dashboard-metric-link"><MetricTile :label="t('dashboard.problems')" :value="dashboardProblemCount" icon="i-lucide-triangle-alert" :tone="dashboardProblemCount ? 'danger' : 'neutral'" /></NuxtLink>
      <MetricTile v-if="isWorkerView" :label="t('dashboard.pool')" :value="formatEuro(cleanerPool)" icon="i-lucide-wallet" />
    </div>

    <div class="grid gap-5" :class="{ 'xl:grid-cols-[1.25fr_.75fr]': canViewWork }">
      <section class="surface">
        <div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">{{ isWorkerView ? t('dashboard.workForMonth') : t('dashboard.bookingsForMonth') }}</h2><UButton :to="isWorkerView ? '/work' : '/calendar'" color="neutral" variant="ghost">{{ t('dashboard.all') }}</UButton></div>
        <div v-if="isWorkerView && openCleanings.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="cleaning in openCleanings.slice(0, 5)" :key="cleaning.id" :to="dashboardWorkHref(cleaning)" class="dashboard-list-row"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-broom" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ formatDate(cleaning.scheduledOn) }} · {{ cleaning.apartment.hotel.name }}</p></div><StatusBadge :label="statusLabel[cleaning.status] ?? cleaning.status" :tone="cleaning.status === 'in_progress' ? 'warning' : 'info'" /></NuxtLink></div>
        <div v-else-if="!isWorkerView && upcoming.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="stay in upcoming" :key="stay.id" to="/calendar" class="dashboard-list-row"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-calendar-range" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stay.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ stay.apartment.hotel.name }} · {{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ stay.adultCount + stay.childCount }} {{ t('dashboard.guests') }} <span v-if="stay.childCount">· {{ stay.adultCount }} {{ t('dashboard.adults') }}, {{ stay.childCount }} {{ t('dashboard.children') }}</span></p></div></NuxtLink></div>
        <EmptyState v-else icon="i-lucide-calendar-check" :title="isWorkerView ? t('dashboard.noWork') : t('dashboard.noBookings')" :description="isWorkerView ? t('dashboard.newAssignments') : t('dashboard.chooseMonth')" />
      </section>

      <section v-if="canViewWork" class="surface mt-4">
        <div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">{{ t('dashboard.attention') }}</h2><UButton to="/work" color="neutral" variant="ghost">{{ t('dashboard.toWork') }}</UButton></div>
        <div v-if="problems.length || undatedWork.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="problem in problems.slice(0, 4)" :key="problem.id" :to="dashboardWorkHref(problem)" class="dashboard-list-row"><div class="flex items-start gap-3"><UIcon name="i-lucide-circle-alert" class="mt-0.5 size-5 shrink-0 text-red-600" /><div><p class="font-semibold">{{ problem.apartment.name }}</p><p class="mt-1 text-sm text-red-700">{{ problem.problemDescription || t('dashboard.workProblem') }}</p></div></div></NuxtLink><NuxtLink v-for="work in undatedWork.slice(0, 4)" :key="`undated-${work.id}`" :to="dashboardWorkHref(work)" class="dashboard-list-row"><div class="flex items-start gap-3"><UIcon name="i-lucide-calendar-off" class="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p class="font-semibold">{{ work.apartment.name }}</p><p class="mt-1 text-sm text-amber-700">{{ work.hasProblem ? (work.problemDescription || t('dashboard.workProblem')) : t('dashboard.assignDate') }}</p></div></div></NuxtLink></div>
        <EmptyState v-else icon="i-lucide-circle-check" :title="t('dashboard.calm')" :description="t('dashboard.calmDescription')" />
      </section>
    </div>
  </section>
</template>
