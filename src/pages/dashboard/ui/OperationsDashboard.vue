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
const key = computed(() => `dashboard-operations:attention-v2:problems-v1:week-v2:${user.value?.organizationId}:${user.value?.id}`)
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
const workLink = (filter?: string, cleanerId?: string, date = data.value?.today, tasks = false) => ({ path: '/work', query: { date, ...(filter ? { filter } : {}), ...(cleanerId ? { cleanerId } : {}), ...(tasks ? { tab: 'tasks' } : {}) } })
const metrics = computed(() => data.value ? [
  { label: 'total', value: data.value.summary.total, filter: undefined, icon: 'i-lucide-broom' },
  { label: 'completed', value: data.value.summary.completed, filter: 'completed', icon: 'i-lucide-check-check' },
  { label: 'inProgress', value: data.value.summary.inProgress, filter: 'in_progress', icon: 'i-lucide-brush-cleaning' },
  { label: 'notStarted', value: data.value.summary.notStarted, filter: 'not_started', icon: 'i-lucide-clock-3' }
] : [])
const reasonLabel = (reasons: OperationsReason[]) => reasons.map(r => t(`operations.reasons.${r}`)).join(' · ')
const stateTone = (state: PreparationState) => state === 'completed' ? 'success' : state === 'unknown' || state === 'unassigned' ? 'warning' : 'info'
const weekDate = (date: string) => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', timeZone: 'Europe/Sofia' }).format(new Date(`${date}T12:00:00Z`))
const weekDay = (date: string) => date === data.value?.today ? t('operations.today') : new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'Europe/Sofia' }).format(new Date(`${date}T12:00:00Z`))
const weekCount = (kind: 'cleanings' | 'urgent', count: number) => t(`operations.weekCounts.${kind}.${new Intl.PluralRules(locale.value).select(count)}`, { count })
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
    <UAlert v-if="error" color="error" orientation="horizontal" role="alert" :description="t('operations.loadError')">
      <template #actions>
        <UButton color="error" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">{{ t('operations.retry') }}</UButton>
      </template>
    </UAlert>
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
          <article v-for="person in data.team" :key="person.id" class="operations-team-row flex flex-wrap items-center justify-between gap-3 py-4">
            <NuxtLink :to="workLink(undefined, person.id)" class="operations-team-person operations-link flex min-h-11 min-w-0 flex-1 flex-col justify-center"><span class="font-semibold">{{ person.name }}</span><span class="text-sm text-[var(--color-muted)]">{{ t('operations.teamProgress', { completed: person.completed, remaining: person.remaining }) }}</span></NuxtLink>
            <div class="operations-team-actions flex flex-wrap gap-2 text-sm">
              <UButton v-if="person.urgent" :to="workLink('urgent', person.id)" class="min-h-11" color="warning" variant="soft">{{ t('operations.urgentCount', { count: person.urgent }) }}</UButton>
              <UButton v-if="person.unaccepted" :to="workLink('unaccepted', person.id)" class="min-h-11" color="warning" variant="soft">{{ t('operations.unacceptedCount', { count: person.unaccepted }) }}</UButton>
              <UButton v-if="person.tasks" :to="workLink(undefined, person.id, data.today, true)" class="min-h-11" color="neutral" variant="soft">{{ t('operations.tasksCount', { count: person.tasks }) }}</UButton>
            </div>
          </article>
        </div>
        <EmptyState v-else icon="i-lucide-users" :title="t('operations.noTeam')" :description="t('operations.noTeamDescription')" />
      </section>

      <section class="operations-week surface overflow-hidden" aria-labelledby="operations-week-title">
        <div class="operations-heading">
          <h2 id="operations-week-title" class="font-semibold">{{ t('operations.week') }}</h2>
          <UButton to="/work" color="neutral" variant="ghost" class="min-h-11" :aria-label="t('operations.allWork')"><span class="hidden sm:inline">{{ t('operations.allWork') }}</span><UIcon name="i-lucide-arrow-right" class="size-4 rtl:rotate-180" /></UButton>
        </div>
        <div class="operations-week-columns" aria-hidden="true"><span>{{ t('operations.day') }}</span><span>{{ t('operations.totalCleanings') }}</span><span>{{ t('operations.unassigned') }}</span></div>
        <ul class="operations-week-list">
          <li v-for="day in data.days" :key="day.date" class="operations-week-row" :data-today="day.date === data.today">
            <p class="operations-week-date">{{ weekDay(day.date) }}, {{ weekDate(day.date) }}</p>
            <div class="operations-week-summary">
              <NuxtLink :to="workLink(undefined, undefined, day.date)" class="operations-link operations-week-total tabular-nums">{{ weekCount('cleanings', day.assigned + day.unassigned) }}</NuxtLink>
              <NuxtLink v-if="day.urgent" :to="workLink('urgent', undefined, day.date)" class="operations-week-urgent tabular-nums" :aria-label="`${formatDate(day.date)}: ${weekCount('urgent', day.urgent)}`"><span class="sm:hidden">{{ t('operations.urgentCount', { count: day.urgent }) }}</span><span class="hidden sm:inline">{{ weekCount('urgent', day.urgent) }}</span></NuxtLink>
            </div>
            <div class="operations-week-action">
              <UButton v-if="day.unassigned" :to="workLink('unassigned', undefined, day.date)" color="warning" variant="soft" class="operations-week-assign min-h-11 justify-center tabular-nums" :aria-label="`${formatDate(day.date)}: ${t('operations.assignCount', { count: day.unassigned })}`">{{ t('operations.assignCount', { count: day.unassigned }) }}<UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 rtl:rotate-180" /></UButton>
              <span v-else-if="day.assigned" class="operations-week-assigned"><UIcon name="i-lucide-circle-check" class="size-4 shrink-0" />{{ t('operations.allAssigned') }}</span>
              <span v-else class="text-sm text-[var(--color-muted)]">{{ t('operations.noCleanings') }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section id="operations-arrivals" class="surface scroll-mt-4 overflow-hidden" aria-labelledby="operations-arrivals-title">
        <div class="operations-heading operations-arrivals-heading">
          <h2 id="operations-arrivals-title" class="font-semibold">{{ t('operations.preparation') }}</h2>
          <div class="operations-arrivals-period" role="group" :aria-label="t('operations.preparation')">
            <UButton class="operations-arrivals-period__button" color="primary" :variant="!allArrivals ? 'solid' : 'outline'" :aria-pressed="!allArrivals" @click="allArrivals = false; arrivalsFilter = 'all'">{{ t('operations.todayTomorrow') }}</UButton>
            <UButton class="operations-arrivals-period__button" color="primary" :variant="allArrivals ? 'solid' : 'outline'" :aria-pressed="allArrivals" @click="allArrivals = true; arrivalsFilter = 'all'">{{ t('operations.allWeek') }}</UButton>
          </div>
        </div>
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
@media (max-width: 639px) {
  .operations-team-row { flex-direction: column; align-items: stretch; gap: 6px; padding-block: 10px; }
  .operations-team-person { flex: none; }
  .operations-team-person > :last-child { font-size: 12px; line-height: 18px; }
  .operations-team-actions { gap: 6px; padding-inline: 8px; }
  .operations-team-actions > :deep(a) { min-height: 36px; padding: 4px 8px; border-radius: 8px; font-size: 12px; line-height: 16px; }
}
.operations-arrivals-heading { align-items: stretch; flex-direction: column; gap: 8px; }
.operations-arrivals-period { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; width: 100%; }
.operations-arrivals-period__button { width: 100%; min-height: 44px; justify-content: center; padding: 4px 8px; font-size: 12px; line-height: 16px; white-space: normal; }
@media (min-width: 640px) {
  .operations-arrivals-heading { flex-direction: row; align-items: center; }
  .operations-arrivals-period { width: 320px; max-width: 100%; }
}
.operations-link { cursor: pointer; border-radius: 10px; padding: 4px 8px; transition: background-color 150ms; }
.operations-link:hover { background-color: var(--color-primary-soft); }
.operations-link:active { background-color: var(--color-surface-muted); }
.operations-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
/* Share one 44px line for total and urgent links without overlapping hit areas. */
.operations-week > .operations-heading { min-height: 52px; padding-block: 4px; }
.operations-week-columns { display: none; }
.operations-week-list { display: grid; grid-template-columns: minmax(0, 1fr) max-content 132px; column-gap: 8px; margin: 0; padding: 0 16px; list-style: none; }
.operations-week-row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; column-gap: 8px; padding: 4px 0; border-top: 1px solid var(--color-line); }
.operations-week-row[data-today="true"] { background: var(--color-primary-soft); }
.operations-week-date { grid-column: 1 / 3; margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.operations-week-row[data-today="true"] .operations-week-date { color: var(--color-primary); font-weight: 600; }
.operations-week-summary { grid-column: 1 / 3; display: grid; grid-template-columns: subgrid; align-items: center; column-gap: 8px; min-width: 0; }
.operations-week-total { display: flex; align-items: center; min-height: 44px; font-size: 13px; }
.operations-week-urgent { grid-column: 2; display: flex; align-items: center; min-height: 44px; border-radius: 10px; padding: 4px 8px; color: var(--tone-danger-ink); font-size: 12px; white-space: nowrap; cursor: pointer; transition: background-color 150ms; }
.operations-week-urgent:hover { background: var(--tone-danger-bg); text-decoration: underline; }
.operations-week-urgent:active { background: color-mix(in srgb, var(--tone-danger-bg) 85%, var(--tone-danger-ink)); }
.operations-week-urgent:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.operations-week-action { grid-column: 3; grid-row: 1 / 3; justify-self: end; width: 132px; }
.operations-week-assign { width: 100%; cursor: pointer; font-size: 12px; }
.operations-week-assigned { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: var(--tone-success-ink); }
@media (min-width: 640px) {
  .operations-week-list { grid-template-columns: minmax(120px, .8fr) minmax(0, .6fr) max-content 160px; column-gap: 12px; padding-inline: 24px; }
  .operations-week-columns { grid-template-columns: minmax(120px, .8fr) minmax(0, 1.2fr) 160px; }
  .operations-week-columns { gap: 12px; padding-inline: 24px; }
  .operations-week-row { gap: 12px; }
  .operations-week-columns { display: grid; padding-block: 4px 8px; color: var(--color-muted); font-size: 12px; }
  .operations-week-row { min-height: 56px; }
  .operations-week-date { grid-column: 1; font-size: 15px; }
  .operations-week-summary { grid-column: 2 / 4; grid-row: 1; }
  .operations-week-total { display: flex; font-size: 16px; font-weight: 600; }
  .operations-week-urgent { font-size: 12px; }
  .operations-week-action { grid-column: 4; grid-row: 1; width: 160px; }
  .operations-week-assign, .operations-week-assigned { font-size: 14px; }
}
@media (min-width: 640px) { .operations-heading { padding-inline: 24px; } }
@media (prefers-reduced-motion: reduce) { .operations-link, .operations-problems, .operations-week-urgent { transition: none; } }
</style>
