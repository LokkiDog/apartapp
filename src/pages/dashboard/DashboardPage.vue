<script setup lang="ts">
import Decimal from 'decimal.js'
import type { Cleaning } from '#fsd/entities/cleaning'
import type { Stay } from '#fsd/entities/stay'
import type { Task } from '#fsd/entities/task'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { canAccessWorkSection, useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, MetricTile, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { activeCleaning, activeTask, currentDashboardMonth, dashboardMonthLabel, dateInDashboardMonth, isDashboardMonth, problemDashboardRecord, shiftDashboardMonth, sortDashboardRecords, stayInDashboardMonth, undatedDashboardRecord } from './model/dashboard-month'

const currentUser = useCurrentUser()
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
  const label = dashboardMonthLabel(dashboardMonth.value)
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
const cleanerPool = computed(() => Number(openCleanings.value.reduce((sum, item) => sum.plus(item.tariffSnapshot.cleanerPoolEur ?? 0), new Decimal(0)).toDecimalPlaces(2)))
const statusLabel: Record<string, string> = { unassigned: 'Без исполнителя', assigned: 'Назначено', in_progress: 'В работе', open: 'Открыта' }

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
    <PageHeader
      class="dashboard-page-header"
      :title="isWorkerView ? `Мои работы · ${monthLabel}` : `${monthLabel} в апартаментах`"
      :description="isWorkerView ? 'Назначенные работы и задачи за выбранный месяц.' : isAdministrator ? 'Заезды, уборки и задачи, которым нужно внимание.' : 'Заезды и выезды за выбранный месяц.'"
    >
      <template #actions>
        <div class="dashboard-page-header__actions">
          <div class="dashboard-month-control" aria-label="Выбор месяца">
            <UButton color="neutral" variant="soft" icon="i-lucide-chevron-left" aria-label="Предыдущий месяц" @click="shiftMonth(-1)" />
            <span class="dashboard-month-control__label">{{ monthLabel }}</span>
            <UButton color="neutral" variant="soft" icon="i-lucide-chevron-right" aria-label="Следующий месяц" @click="shiftMonth(1)" />
            <UButton v-if="dashboardMonth !== currentMonth" color="neutral" variant="ghost" @click="resetMonth">Текущий месяц</UButton>
          </div>
          <UButton v-if="!isWorkerView" to="/calendar" icon="i-lucide-plus">Новый заезд</UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="staysStatus === 'pending'" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <USkeleton v-for="item in 4" :key="item" class="h-28 rounded-2xl" />
    </div>
    <div v-else class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <NuxtLink v-if="!isWorkerView" to="/calendar" class="dashboard-metric-link"><MetricTile label="Заезды и выезды" :value="upcoming.length" icon="i-lucide-log-in" /></NuxtLink>
      <NuxtLink v-if="canViewWork" to="/work" class="dashboard-metric-link"><MetricTile label="Уборки" :value="openCleanings.length" icon="i-lucide-sparkles" /></NuxtLink>
      <NuxtLink v-if="canViewWork" to="/work" class="dashboard-metric-link"><MetricTile label="Открытые задачи" :value="openTasks.length" icon="i-lucide-clipboard-check" /></NuxtLink>
      <NuxtLink v-if="isAdministrator" to="/work" class="dashboard-metric-link"><MetricTile label="Проблемы" :value="problems.length + undatedWork.filter(item => item.hasProblem).length" icon="i-lucide-triangle-alert" :tone="problems.length || undatedWork.some(item => item.hasProblem) ? 'danger' : 'neutral'" /></NuxtLink>
      <MetricTile v-if="isWorkerView" label="Общий фонд" :value="formatEuro(cleanerPool)" icon="i-lucide-wallet" />
    </div>

    <div class="grid gap-5" :class="{ 'xl:grid-cols-[1.25fr_.75fr]': canViewWork }">
      <section class="surface">
        <div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">{{ isWorkerView ? 'Работы за месяц' : 'Заезды и выезды за месяц' }}</h2><UButton :to="isWorkerView ? '/work' : '/calendar'" color="neutral" variant="ghost">Все</UButton></div>
        <div v-if="isWorkerView && openCleanings.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="cleaning in openCleanings.slice(0, 5)" :key="cleaning.id" :to="dashboardWorkHref(cleaning)" class="dashboard-list-row"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-sparkles" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ formatDate(cleaning.scheduledOn) }} · {{ cleaning.apartment.hotel.name }}</p></div><StatusBadge :label="statusLabel[cleaning.status] ?? cleaning.status" :tone="cleaning.status === 'in_progress' ? 'warning' : 'info'" /></NuxtLink></div>
        <div v-else-if="!isWorkerView && upcoming.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="stay in upcoming" :key="stay.id" to="/calendar" class="dashboard-list-row"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-calendar-range" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stay.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ stay.apartment.hotel.name }} · {{ formatDate(stay.checkInOn) }} → {{ formatDate(stay.checkOutOn) }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ stay.adultCount + stay.childCount }} гостей <span v-if="stay.childCount">· {{ stay.adultCount }} взрослых, {{ stay.childCount }} детей</span></p></div></NuxtLink></div>
        <EmptyState v-else icon="i-lucide-calendar-check" :title="isWorkerView ? 'Работ за этот месяц нет' : 'Заездов и выездов нет'" :description="isWorkerView ? 'Новые назначения появятся здесь.' : 'Выберите другой месяц или создайте заезд.'" />
      </section>

      <section v-if="canViewWork" class="surface mt-4">
        <div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">Требует внимания</h2><UButton to="/work" color="neutral" variant="ghost">К работам</UButton></div>
        <div v-if="problems.length || undatedWork.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><NuxtLink v-for="problem in problems.slice(0, 4)" :key="problem.id" :to="dashboardWorkHref(problem)" class="dashboard-list-row"><div class="flex items-start gap-3"><UIcon name="i-lucide-circle-alert" class="mt-0.5 size-5 shrink-0 text-red-600" /><div><p class="font-semibold">{{ problem.apartment.name }}</p><p class="mt-1 text-sm text-red-700">{{ problem.problemDescription || 'Есть проблема в работе' }}</p></div></div></NuxtLink><NuxtLink v-for="work in undatedWork.slice(0, 4)" :key="`undated-${work.id}`" :to="dashboardWorkHref(work)" class="dashboard-list-row"><div class="flex items-start gap-3"><UIcon name="i-lucide-calendar-off" class="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p class="font-semibold">{{ work.apartment.name }}</p><p class="mt-1 text-sm text-amber-700">{{ work.hasProblem ? (work.problemDescription || 'Есть проблема в работе') : 'Нужно назначить дату' }}</p></div></div></NuxtLink></div>
        <EmptyState v-else icon="i-lucide-circle-check" title="Всё спокойно" description="Открытых проблем и работ без даты нет." />
      </section>
    </div>
  </section>
</template>
