<script setup lang="ts">
import type { DashboardOperationsResponse, OperationsReason, PreparationState } from '@contracts/dashboard-operations'
import { useI18n } from 'vue-i18n'
import { useCurrentUser } from '#fsd/shared/auth'
import { useNotificationState } from '#fsd/features/manage-notifications'
import { EmptyState, MetricTile, StatusBadge } from '#fsd/shared/ui'
import { formatDate, formatDateTime } from '#fsd/shared/lib'
import OperationsAttentionPanel from './OperationsAttentionPanel.vue'

const user = useCurrentUser()
const notifications = useNotificationState()
const { t, locale } = useI18n()
const key = computed(() => `dashboard-operations:attention-v2:problems-v1:${user.value?.organizationId}:${user.value?.id}`)
const { data, status, error, refresh } = await useAsyncData(key, () =>
  user.value?.roles.includes('administrator') ? $fetch<DashboardOperationsResponse>('/api/dashboard/operations') : Promise.resolve(null),
{ server: false, default: () => null, watch: [user] })
const updatedTime = computed(() => data.value
  ? new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia' }).format(new Date(data.value.generatedAt))
  : '')
const allArrivals = ref(false)
const arrivalsFilter = ref<'all' | 'today' | 'turnovers'>('all')
const arrivals = computed(() => data.value?.arrivals.filter(a => {
  if (arrivalsFilter.value === 'today') return a.date === data.value?.today
  if (arrivalsFilter.value === 'turnovers') return a.date === data.value?.today && a.turnover
  return allArrivals.value || a.date <= tomorrow.value
}) ?? [])
const tomorrow = computed(() => {
  if (!data.value) return ''
  const value = new Date(`${data.value.today}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
})
const peak = computed(() => Math.max(1, ...(data.value?.days.map(d => d.assigned + d.unassigned) ?? [])))
const workLink = (filter?: string, cleanerId?: string, date = data.value?.today, tasks = false) => ({ path: '/work', query: { date, ...(filter ? { filter } : {}), ...(cleanerId ? { cleanerId } : {}), ...(tasks ? { tab: 'tasks' } : {}) } })
const metrics = computed(() => data.value ? [
  { label: 'total', value: data.value.summary.total, filter: undefined, icon: 'i-lucide-broom' },
  { label: 'completed', value: data.value.summary.completed, filter: 'completed', icon: 'i-lucide-check-check' },
  { label: 'inProgress', value: data.value.summary.inProgress, filter: 'in_progress', icon: 'i-lucide-brush-cleaning' },
  { label: 'notStarted', value: data.value.summary.notStarted, filter: 'not_started', icon: 'i-lucide-clock-3' }
] : [])
const reasonLabel = (reasons: OperationsReason[]) => reasons.map(r => t(`operations.reasons.${r}`)).join(' · ')
const stateTone = (state: PreparationState) => state === 'completed' ? 'success' : state === 'unknown' || state === 'unassigned' ? 'warning' : 'info'
const weekDay = (date: string) => new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'Europe/Sofia' }).format(new Date(`${date}T12:00:00Z`))
function showArrivals(filter: 'today' | 'turnovers') { arrivalsFilter.value = arrivalsFilter.value === filter ? 'all' : filter }
watch([notifications.cleaningRevision, notifications.taskRevision, notifications.revision], () => { void refresh() })
let timer: ReturnType<typeof setInterval> | undefined
function refreshVisible() { if (document.visibilityState === 'visible') void refresh() }
function checkDate() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (data.value && data.value.today !== date && status.value !== 'pending') void refresh()
}
onMounted(() => {
  timer = setInterval(checkDate, 30_000)
  window.addEventListener('focus', refreshVisible)
  document.addEventListener('visibilitychange', refreshVisible)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('focus', refreshVisible)
  document.removeEventListener('visibilitychange', refreshVisible)
})
</script>

<template>
  <div class="space-y-6" :aria-busy="status === 'pending'">
    <div v-if="error" class="surface space-y-3 p-5" role="alert">
      <p class="font-semibold">{{ t('operations.loadError') }}</p>
      <UButton class="min-h-11" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">{{ t('operations.retry') }}</UButton>
    </div>
    <div v-else-if="!data" class="space-y-4" :aria-label="t('operations.loading')">
      <div class="operations-today-metrics"><USkeleton v-for="n in 4" :key="n" class="h-24 rounded-2xl" /></div><USkeleton class="h-48 rounded-2xl" /><USkeleton class="h-64 rounded-2xl" />
    </div>
    <template v-else>
      <section class="space-y-3" aria-labelledby="operations-today-title">
        <div class="flex items-center justify-between gap-2">
          <h2 id="operations-today-title" class="shrink-0 font-semibold">{{ t('operations.today') }}</h2>
          <div class="flex min-w-0 items-center gap-1 text-xs text-[var(--color-muted)] sm:gap-2 sm:text-sm">
            <span class="truncate" :title="formatDateTime(data.generatedAt)">{{ t('operations.updated', { date: updatedTime }) }}</span>
            <UButton class="min-h-11 min-w-11 shrink-0" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" :aria-label="t('operations.refresh')" @click="refresh()" />
          </div>
        </div>
        <div class="operations-today-metrics"><NuxtLink v-for="metric in metrics" :key="metric.label" :to="workLink(metric.filter)" class="dashboard-metric-link cursor-pointer"><MetricTile :label="t(`operations.${metric.label}`)" :value="metric.value" :icon="metric.icon" /></NuxtLink></div>
      </section>

      <NuxtLink to="/problems" class="operations-problems surface" :data-alert="data.problems.openCount > 0">
        <UIcon name="i-lucide-triangle-alert" class="size-5 shrink-0" />
        <span class="font-semibold">{{ t('dashboard.problems') }}</span>
        <span class="text-2xl font-semibold tabular-nums">{{ data.problems.openCount }}</span>
        <UIcon name="i-lucide-chevron-right" class="ms-auto size-5 shrink-0" />
      </NuxtLink>

      <OperationsAttentionPanel :items="data.attention" :today="data.today" />

      <section class="surface overflow-hidden" aria-labelledby="operations-team-title">
        <div class="operations-heading"><h2 id="operations-team-title" class="font-semibold">{{ t('operations.team') }}</h2></div>
        <div v-if="data.team.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
          <article v-for="person in data.team" :key="person.id" class="flex flex-wrap items-center justify-between gap-3 py-4">
            <NuxtLink :to="workLink(undefined, person.id)" class="operations-link flex min-h-11 min-w-0 flex-1 flex-col justify-center"><span class="font-semibold">{{ person.name }}</span><span class="text-sm text-[var(--color-muted)]">{{ t('operations.teamProgress', { completed: person.completed, remaining: person.remaining }) }}</span></NuxtLink>
            <div class="flex flex-wrap gap-2 text-sm">
              <UButton v-if="person.urgent" :to="workLink('urgent', person.id)" class="min-h-11" color="warning" variant="soft">{{ t('operations.urgentCount', { count: person.urgent }) }}</UButton>
              <UButton v-if="person.unaccepted" :to="workLink('unaccepted', person.id)" class="min-h-11" color="warning" variant="soft">{{ t('operations.unacceptedCount', { count: person.unaccepted }) }}</UButton>
              <UButton v-if="person.tasks" :to="workLink(undefined, person.id, data.today, true)" class="min-h-11" color="neutral" variant="soft">{{ t('operations.tasksCount', { count: person.tasks }) }}</UButton>
            </div>
          </article>
        </div>
        <EmptyState v-else icon="i-lucide-users" :title="t('operations.noTeam')" :description="t('operations.noTeamDescription')" />
      </section>

      <section class="surface overflow-hidden" aria-labelledby="operations-week-title">
        <div class="operations-heading"><h2 id="operations-week-title" class="font-semibold">{{ t('operations.week') }}</h2></div>
        <div class="flex flex-wrap gap-4 px-5 text-xs text-[var(--color-muted)] sm:px-6"><span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-[var(--color-primary)]" />{{ t('operations.assigned') }}</span><span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-[var(--tone-warning-ink)]" />{{ t('operations.unassigned') }}</span></div>
        <div class="overflow-x-auto px-3 pb-5 pt-4 sm:px-5" role="group" :aria-label="t('operations.chartLabel')">
          <div class="grid min-w-[350px] grid-cols-7 gap-1">
            <NuxtLink v-for="day in data.days" :key="day.date" :to="workLink(undefined, undefined, day.date)" class="operations-chart-day operations-link" :aria-label="t('operations.dayDescription', { date: formatDate(day.date), assigned: day.assigned, unassigned: day.unassigned, arrivals: day.arrivals, turnovers: day.turnovers })">
              <span class="tabular-nums font-semibold">{{ day.assigned + day.unassigned }}</span>
              <span class="flex h-32 w-full max-w-8 flex-col justify-end overflow-hidden" aria-hidden="true"><span class="block w-full bg-[var(--tone-warning-ink)]" :style="{ height: `${day.unassigned / peak * 100}%` }" /><span class="block w-full bg-[var(--color-primary)]" :style="{ height: `${day.assigned / peak * 100}%` }" /></span>
              <span class="text-xs tabular-nums text-[var(--color-muted)]">{{ day.assigned }} / {{ day.unassigned }}</span>
              <span class="text-sm font-semibold">{{ weekDay(day.date) }}</span><span class="text-xs tabular-nums">{{ day.date.slice(8) }}.{{ day.date.slice(5, 7) }}</span>
              <span class="text-xs tabular-nums" :title="t('operations.arrivals')">{{ t('operations.arrivalsShort') }} {{ day.arrivals }}</span><span class="text-xs tabular-nums" :title="t('operations.turnovers')">{{ t('operations.turnoversShort') }} {{ day.turnovers }}</span>
            </NuxtLink>
          </div>
        </div>
        <p class="border-t border-[var(--color-line)] px-5 py-3 text-xs text-[var(--color-muted)] sm:px-6">{{ t('operations.chartNote') }}</p>
      </section>

      <section id="operations-arrivals" class="surface scroll-mt-4 overflow-hidden" aria-labelledby="operations-arrivals-title">
        <div class="operations-heading"><h2 id="operations-arrivals-title" class="font-semibold">{{ t('operations.preparation') }}</h2><UButton class="min-h-11" color="neutral" variant="ghost" :aria-expanded="allArrivals" @click="allArrivals = !allArrivals; arrivalsFilter = 'all'">{{ t(allArrivals ? 'operations.todayTomorrow' : 'operations.allWeek') }}</UButton></div>
        <div class="flex flex-wrap items-center gap-1 px-5 pb-2 sm:px-6">
          <span class="me-1 text-xs text-[var(--color-muted)]">{{ t('operations.today') }}</span>
          <UButton class="min-h-11 cursor-pointer text-xs" color="primary" :variant="arrivalsFilter === 'today' ? 'soft' : 'ghost'" :aria-pressed="arrivalsFilter === 'today'" :aria-label="`${t('operations.arrivalsToday')}: ${data.summary.arrivals}`" :title="t('operations.arrivalsToday')" @click="showArrivals('today')">{{ t('operations.arrivalsShort') }} <span class="tabular-nums">{{ data.summary.arrivals }}</span></UButton>
          <UButton class="min-h-11 cursor-pointer text-xs" color="primary" :variant="arrivalsFilter === 'turnovers' ? 'soft' : 'ghost'" :aria-pressed="arrivalsFilter === 'turnovers'" :aria-label="`${t('operations.turnoversToday')}: ${data.summary.turnovers}`" :title="t('operations.turnoversToday')" @click="showArrivals('turnovers')">{{ t('operations.turnoversShort') }} <span class="tabular-nums">{{ data.summary.turnovers }}</span></UButton>
        </div>
        <div v-if="arrivals.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
          <article v-for="arrival in arrivals" :key="arrival.id" class="py-4">
            <NuxtLink :to="arrival.href" class="operations-link flex min-h-11 flex-wrap items-start justify-between gap-3"><div class="min-w-0"><p class="font-semibold">{{ arrival.apartment.name }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ arrival.apartment.hotel.name }} · {{ formatDate(arrival.date) }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ arrival.guestCount === null ? t('operations.unknownGuests') : t('operations.guestsCount', { count: arrival.guestCount }) }}</p></div><StatusBadge :label="t(`operations.states.${arrival.state}`)" :tone="stateTone(arrival.state)" /></NuxtLink>
            <p v-if="arrival.reasons.length" class="mt-2 text-sm text-[var(--tone-warning-ink)]">{{ reasonLabel(arrival.reasons) }}</p>
            <NuxtLink v-for="problem in arrival.problems" :key="problem.id" :to="`/problems?problemId=${encodeURIComponent(problem.id)}`" class="operations-link mt-2 flex min-h-11 items-center gap-2 text-sm text-[var(--tone-warning-ink)]"><UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />{{ problem.description }}</NuxtLink>
          </article>
        </div>
        <EmptyState v-else icon="i-lucide-calendar-check" :title="t('operations.noArrivals')" :description="t('operations.noArrivalsDescription')" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.operations-today-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.operations-today-metrics :deep(.metric-tile) { height: 100%; padding: 12px 6px; }
.operations-today-metrics :deep(.metric-tile > div) { min-height: 32px; justify-content: center; }
.operations-today-metrics :deep(.metric-tile > div > p) { font-size: 12px; line-height: 16px; text-align: center; }
.operations-today-metrics :deep(.metric-tile > div > :last-child:not(p)) { display: none; }
.operations-today-metrics :deep(.metric-tile > p) { margin-top: 4px; text-align: center; }
@media (min-width: 360px) { .operations-today-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (min-width: 640px) {
  .operations-today-metrics { gap: 12px; }
  .operations-today-metrics :deep(.metric-tile) { padding: 16px; }
  .operations-today-metrics :deep(.metric-tile > div) { justify-content: space-between; gap: 8px; }
  .operations-today-metrics :deep(.metric-tile > div > p) { font-size: 14px; line-height: 20px; text-align: start; }
  .operations-today-metrics :deep(.metric-tile > div > :last-child:not(p)) { display: inline-block; flex-shrink: 0; }
  .operations-today-metrics :deep(.metric-tile > p) { margin-top: 12px; text-align: start; }
}

.operations-problems { display: flex; min-height: 64px; align-items: center; gap: 12px; padding: 12px 20px; color: var(--color-muted); cursor: pointer; transition: background-color 150ms; }
.operations-problems[data-alert="true"] { background: var(--tone-danger-bg); color: var(--tone-danger-ink); }
.operations-problems:hover { background: var(--color-surface-muted); }
.operations-problems[data-alert="true"]:hover { background: color-mix(in srgb, var(--tone-danger-bg) 90%, var(--tone-danger-ink)); }
.operations-problems:active { background: var(--color-line); }
.operations-problems[data-alert="true"]:active { background: color-mix(in srgb, var(--tone-danger-bg) 82%, var(--tone-danger-ink)); }
.operations-problems:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.operations-heading { display: flex; min-height: 64px; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 20px; }
.operations-link { cursor: pointer; border-radius: 10px; transition: background-color 150ms; }
.operations-link:hover { background-color: var(--color-primary-soft); }
.operations-link:active { background-color: var(--color-surface-muted); }
.operations-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.operations-chart-day { display: flex; min-height: 44px; flex-direction: column; align-items: center; gap: 4px; padding: 8px 2px; }
@media (min-width: 640px) { .operations-heading { padding-inline: 24px; } }
@media (prefers-reduced-motion: reduce) { .operations-link, .operations-problems { transition: none; } }
</style>
