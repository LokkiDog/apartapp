<script setup lang="ts">
import Decimal from 'decimal.js'
import type { Cleaning } from '#fsd/entities/cleaning'
import type { Stay } from '#fsd/entities/stay'
import type { Task } from '#fsd/entities/task'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, MetricTile, PageHeader, StatusBadge } from '#fsd/shared/ui'

const currentUser = useCurrentUser()
const [{ data: stays, status: staysStatus }, { data: cleanings }, { data: tasks }] = await Promise.all([
  useAsyncData('dashboard-stays', () => $fetch<Stay[]>('/api/stays')),
  useAsyncData('dashboard-cleanings', () => $fetch<Cleaning[]>('/api/cleanings')),
  useAsyncData('dashboard-tasks', () => $fetch<Task[]>('/api/tasks'))
])
const isCleanerOnly = computed(() => currentUser.value?.roles.includes('cleaner') && !currentUser.value.roles.some(role => ['administrator', 'manager'].includes(role)))
const today = new Date().toISOString().slice(0, 10)
const upcoming = computed(() => (stays.value ?? []).filter(stay => stay.checkInOn >= today).slice(0, 5))
const openCleanings = computed(() => (cleanings.value ?? []).filter(item => !['completed', 'canceled'].includes(item.status)))
const openTasks = computed(() => (tasks.value ?? []).filter(item => !['completed', 'canceled'].includes(item.status)))
const problems = computed(() => [...(cleanings.value ?? []), ...(tasks.value ?? [])].filter(item => item.hasProblem))
const cleanerPool = computed(() => Number(openCleanings.value.reduce((sum, item) => sum.plus(item.tariffSnapshot.cleanerPoolEur ?? 0), new Decimal(0)).toDecimalPlaces(2)))
const statusLabel: Record<string, string> = { unassigned: 'Без исполнителя', assigned: 'Назначено', in_progress: 'В работе', open: 'Открыта' }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="isCleanerOnly ? 'Мои работы' : 'Сегодня в апартаментах'" :description="isCleanerOnly ? 'Ближайшие назначения и задачи на сегодня.' : 'Заезды, уборки и задачи, которым нужно внимание.'"><template #actions><UButton v-if="!isCleanerOnly" to="/calendar" icon="i-lucide-plus">Новый заезд</UButton></template></PageHeader>
    <div v-if="staysStatus === 'pending'" class="grid grid-cols-2 gap-3 lg:grid-cols-4"><USkeleton v-for="item in 4" :key="item" class="h-28 rounded-2xl" /></div>
    <div v-else class="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricTile v-if="!isCleanerOnly" label="Ближайшие заезды" :value="upcoming.length" icon="i-lucide-log-in" /><MetricTile label="Уборки" :value="openCleanings.length" icon="i-lucide-sparkles" /><MetricTile label="Открытые задачи" :value="openTasks.length" icon="i-lucide-clipboard-check" /><MetricTile v-if="!isCleanerOnly" label="Проблемы" :value="problems.length" icon="i-lucide-triangle-alert" :tone="problems.length ? 'danger' : 'neutral'" /><MetricTile v-else label="Общий фонд" :value="formatEuro(cleanerPool)" icon="i-lucide-wallet" /></div>
    <div class="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <section class="surface"><div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">{{ isCleanerOnly ? 'Ближайшая работа' : 'Ближайшие заезды' }}</h2><UButton :to="isCleanerOnly ? '/work' : '/calendar'" color="neutral" variant="ghost">Все</UButton></div><div v-if="isCleanerOnly && openCleanings.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="cleaning in openCleanings.slice(0, 5)" :key="cleaning.id" class="flex items-center gap-4 py-4"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-sparkles" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaning.scheduledOn ? formatDate(cleaning.scheduledOn) : 'Дата не назначена' }} · {{ cleaning.apartment.hotel.name }}</p></div><StatusBadge :label="statusLabel[cleaning.status] ?? cleaning.status" :tone="cleaning.status === 'in_progress' ? 'warning' : 'info'" /></div></div><div v-else-if="!isCleanerOnly && upcoming.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="stay in upcoming" :key="stay.id" class="flex items-center gap-4 py-4"><div class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-calendar-range" class="size-5" /></div><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stay.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ stay.apartment.hotel.name }} · {{ formatDate(stay.checkInOn) }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ stay.adultCount + stay.childCount }} гостей <span v-if="stay.childCount">· {{ stay.adultCount }} взрослых, {{ stay.childCount }} детей</span></p></div></div></div><EmptyState v-else icon="i-lucide-calendar-check" :title="isCleanerOnly ? 'Работ пока нет' : 'Заездов пока нет'" :description="isCleanerOnly ? 'Новые назначения появятся здесь.' : 'Создайте первый будущий заезд.'" /></section>
      <section class="surface mt-4"><div class="flex min-h-16 items-center justify-between px-5 sm:px-6"><h2 class="font-semibold">Требует внимания</h2><UButton to="/work" color="neutral" variant="ghost">К работам</UButton></div><div v-if="problems.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="problem in problems.slice(0, 4)" :key="problem.id" class="py-4"><div class="flex items-start gap-3"><UIcon name="i-lucide-circle-alert" class="mt-0.5 size-5 shrink-0 text-red-600" /><div><p class="font-semibold">{{ problem.apartment.name }}</p><p class="mt-1 text-sm text-red-700">{{ problem.problemDescription }}</p></div></div></div></div><EmptyState v-else icon="i-lucide-circle-check" title="Всё спокойно" description="Открытых проблем нет." /></section>
    </div>
  </section>
</template>
