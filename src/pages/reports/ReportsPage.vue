<script setup lang="ts">
import type { GlobalReportResponse, WorkloadDay } from '@contracts/report'
import type { Apartment } from '#fsd/entities/apartment'
import type { Hotel } from '#fsd/entities/hotel'
import { isPropertyScopeReady, PropertyScopeFilter, type PropertyScope } from '#fsd/features/select-property-scope'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { DateRangeInput, EmptyState, MetricTile, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { downloadReportCsv, type ReportTab } from './lib/report-csv'
import { useI18n } from 'vue-i18n'

type Preset = 'week' | 'month' | 'next7' | 'next30' | 'custom'

const user = useCurrentUser()
const { t, locale } = useI18n()
if (!user.value?.roles.includes('administrator')) await navigateTo('/')

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date: Date, amount: number) => { const copy = new Date(date); copy.setDate(copy.getDate() + amount); return copy }
const today = new Date()
const startOfWeek = addDays(today, -((today.getDay() + 6) % 7))
const endOfWeek = addDays(startOfWeek, 6)
const filters = reactive<{ from: string; to: string; scope: PropertyScope; hotelId: string; apartmentIds: string[] }>({
  from: iso(startOfWeek),
  to: iso(endOfWeek),
  scope: 'all',
  hotelId: 'all',
  apartmentIds: []
})
const generatedFilters = ref('')
const preset = ref<Preset>('week')
const activeTab = ref<ReportTab>('summary')
const report = ref<GlobalReportResponse | null>(null)
const pending = ref(false)
const error = ref('')

const { data: hotels } = await useAsyncData('report-hotels', () => user.value ? $fetch<Hotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: apartments, error: apartmentsError } = await useAsyncData('report-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const scopeReady = computed(() => isPropertyScopeReady(filters))
const tabs = computed<Array<{ value: ReportTab; label: string; icon: string }>>(() => [
  { value: 'summary', label: t('reports.summary'), icon: 'i-lucide-layout-dashboard' },
  { value: 'procurement', label: t('reports.procurement'), icon: 'i-lucide-shopping-cart' },
  { value: 'workload', label: t('reports.workload'), icon: 'i-lucide-calendar-range' },
  { value: 'finance', label: t('reports.finance'), icon: 'i-lucide-chart-no-axes-combined' }
])
const presets = computed(() => [
  { label: t('common.currentWeek'), value: 'week' },
  { label: t('common.currentMonth'), value: 'month' },
  { label: t('common.next7'), value: 'next7' },
  { label: t('common.next30'), value: 'next30' },
  { label: t('common.customPeriod'), value: 'custom' }
])
const cleaningLabels = computed<Record<string, string>>(() => ({ unassigned: t('work.statusUnassigned'), assigned: t('work.statusAssigned'), in_progress: t('work.statusProgress'), completed: t('work.statusCompleted'), canceled: t('work.statusCanceled') }))
const taskLabels = computed<Record<string, string>>(() => ({ open: t('work.statusOpen'), in_progress: t('work.statusProgress'), completed: t('work.statusCompleted'), canceled: t('work.statusCanceled') }))
const financeTypeLabels = computed<Record<string, string>>(() => ({ cleaning_charge: t('reports.cleaning'), inventory_charge: t('inventory.consumable'), task_charge: t('work.tasks'), guest_service_charge: t('reports.extraServices'), compensation: t('common.adjustment'), manual_expense: t('expenses.title') }))
function filterSnapshot() {
  return JSON.stringify({ ...filters, apartmentIds: [...filters.apartmentIds].sort() })
}
const dirty = computed(() => Boolean(report.value && generatedFilters.value !== filterSnapshot()))
const criticalProcurement = computed(() => report.value?.procurement.slice(0, 6) ?? [])
const busyDays = computed(() => [...(report.value?.workload.days ?? [])].sort((left, right) => dayLoad(right) - dayLoad(left)).slice(0, 7))

watch(preset, value => {
  if (value === 'custom') return
  if (value === 'week') Object.assign(filters, { from: iso(startOfWeek), to: iso(endOfWeek) })
  if (value === 'month') Object.assign(filters, { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)) })
  if (value === 'next7') Object.assign(filters, { from: iso(today), to: iso(addDays(today, 6)) })
  if (value === 'next30') Object.assign(filters, { from: iso(today), to: iso(addDays(today, 29)) })
})

function dayLoad(day: WorkloadDay) { return day.cleanings.length + day.tasks.length }
function cleaningTone(status: string) { return status === 'completed' ? 'success' : status === 'in_progress' ? 'warning' : status === 'canceled' ? 'neutral' : 'info' as const }
function taskTone(status: string) { return status === 'completed' ? 'success' : status === 'in_progress' ? 'warning' : status === 'canceled' ? 'neutral' : 'info' as const }
function quantity(value: number, unit: string) { return `${new Intl.NumberFormat(locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 3 }).format(value)} ${unit}` }
function plural(value: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(value) % 100
  const mod10 = mod100 % 10
  return mod100 >= 11 && mod100 <= 19 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many
}
function countLabel(value: number, one: string, few: string, many: string) { return `${value} ${plural(value, one, few, many)}` }
function scopeLabel(value: GlobalReportResponse['filters']) {
  if (value.scope === 'all') return t('scope.all')
  if (value.scope === 'hotel') return value.hotelName ?? t('scope.hotelLabel')
  const hotelCount = new Set(value.apartments.map(apartment => apartment.hotelName)).size
  return `${t('scope.selectedMany', { count: value.apartments.length })} · ${hotelCount} ${t('hotels.title').toLocaleLowerCase()}`
}
async function generate() {
  pending.value = true
  error.value = ''
  try {
    const query: Record<string, string | string[]> = { from: filters.from, to: filters.to, scope: filters.scope }
    if (filters.scope === 'hotel') query.hotelId = filters.hotelId
    if (filters.scope === 'apartments') query.apartmentIds = filters.apartmentIds
    report.value = await $fetch<GlobalReportResponse>('/api/reports/summary', { query })
    generatedFilters.value = filterSnapshot()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? cause?.data?.message ?? t('common.error')
  } finally { pending.value = false }
}

await generate()
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('reports.title')">
      <template #actions><UButton v-if="report" color="neutral" variant="outline" icon="i-lucide-download" @click="downloadReportCsv(report, activeTab, locale as 'ru' | 'en' | 'he')">{{ t('reports.downloadCsv') }}</UButton></template>
    </PageHeader>

    <form class="surface report-filters" :class="{ 'report-filters--compact': filters.scope === 'all' }" @submit.prevent="generate">
      <UFormField :label="t('reports.period')"><USelect v-model="preset" :items="presets" class="w-full" /></UFormField>
      <UFormField :label="t('reports.range')"><DateRangeInput v-model:start="filters.from" v-model:end="filters.to" :start-label="t('reports.start')" :end-label="t('reports.end')" required @update:start="preset = 'custom'" @update:end="preset = 'custom'" /></UFormField>
      <PropertyScopeFilter
        v-model:scope="filters.scope"
        v-model:hotel-id="filters.hotelId"
        v-model:apartment-ids="filters.apartmentIds"
        :hotels="hotels ?? []"
        :apartments="apartments ?? []"
        :apartments-error="Boolean(apartmentsError)"
        :scope-label="t('reports.scope')"
        class="report-filters__scope"
      />
      <UButton type="submit" icon="i-lucide-sparkles" :loading="pending" :disabled="!scopeReady" class="min-h-11 justify-center">{{ t('reports.generate') }}</UButton>
    </form>

    <UAlert v-if="dirty" color="warning" variant="soft" :title="t('reports.filtersChanged')" :description="t('reports.refreshSummary')" />
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <div v-if="pending && !report" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><USkeleton v-for="item in 4" :key="item" class="h-28 rounded-2xl" /></div>

    <template v-if="report">
      <div class="report-scope-summary"><UIcon name="i-lucide-target" class="size-4" /><span>{{ t('reports.scopePrefix') }} <strong>{{ scopeLabel(report.filters) }}</strong></span></div>
      <div class="report-tabs" role="tablist" :aria-label="t('reports.title')">
        <button v-for="tab in tabs" :key="tab.value" type="button" class="report-tab" :class="{ 'report-tab--active': activeTab === tab.value }" @click="activeTab = tab.value"><UIcon :name="tab.icon" class="size-4" />{{ tab.label }}</button>
      </div>

      <div v-if="activeTab === 'summary'" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile :label="t('reports.cleaningsInPeriod')" :value="report.summary.scheduledCleanings" icon="i-lucide-sparkles" />
          <MetricTile :label="t('reports.positionsToBuy')" :value="report.summary.procurementPositions" icon="i-lucide-shopping-cart" :tone="report.summary.procurementPositions ? 'warning' : 'neutral'" />
          <MetricTile :label="t('reports.problems')" :value="report.summary.problems" icon="i-lucide-circle-alert" :tone="report.summary.problems ? 'danger' : 'neutral'" />
          <MetricTile :label="t('reports.operatingExpenses')" :value="formatEuro(report.summary.operatingExpensesEur)" icon="i-lucide-receipt-euro" />
        </div>
        <div class="grid gap-6 xl:grid-cols-2">
          <section class="surface overflow-hidden">
            <div class="report-section-heading"><div><h2>{{ t('reports.nearestWorkload') }}</h2><p>{{ t('reports.daysWithWork') }}</p></div><UButton color="neutral" variant="ghost" @click="activeTab = 'workload'">{{ t('reports.details') }}</UButton></div>
            <div v-if="busyDays.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="day in busyDays" :key="day.date" class="report-compact-row"><div><p class="font-semibold">{{ formatDate(day.date) }}</p><p class="text-sm text-[var(--color-muted)]">{{ day.arrivals }} {{ t('calendar.arrival').toLocaleLowerCase() }} · {{ day.departures }} {{ t('calendar.departure').toLocaleLowerCase() }}</p></div><strong class="tabular-nums">{{ dayLoad(day) }} {{ t('work.tasks').toLocaleLowerCase() }}</strong></div></div>
            <EmptyState v-else icon="i-lucide-calendar-check" :title="t('reports.noWork')" :description="t('reports.nothingScheduled')" />
          </section>
          <section class="surface overflow-hidden">
            <div class="report-section-heading"><div><h2>{{ t('reports.needToBuy') }}</h2><p>{{ t('reports.mostImportant') }}</p></div><UButton color="neutral" variant="ghost" @click="activeTab = 'procurement'">{{ t('reports.allList') }}</UButton></div>
            <div v-if="criticalProcurement.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="item in criticalProcurement" :key="item.consumableId" class="report-compact-row"><div class="min-w-0"><p class="truncate font-semibold">{{ item.name }}</p><p class="text-sm text-[var(--color-muted)]">{{ item.apartmentCount }} {{ t('nav.apartments').toLocaleLowerCase() }} · {{ item.category }}</p></div><strong class="shrink-0 tabular-nums">{{ quantity(item.toPurchase, item.unit) }}</strong></div></div>
            <EmptyState v-else icon="i-lucide-circle-check" :title="t('reports.enoughStock')" :description="t('reports.aboveThreshold')" />
          </section>
        </div>
      </div>

      <div v-else-if="activeTab === 'procurement'" class="space-y-4">
        <div class="flex items-center justify-between gap-4"><div><h2 class="text-xl font-semibold">{{ t('reports.purchaseList') }}</h2><p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('reports.purchaseDescription') }}</p></div><StatusBadge v-if="report.procurement.length" :label="`${report.procurement.length} ${t('reports.positionsToBuy').toLocaleLowerCase()}`" tone="warning" /></div>
        <div v-if="report.procurement.length" class="surface divide-y divide-[var(--color-line)] px-4 sm:px-6">
          <details v-for="item in report.procurement" :key="item.consumableId" class="report-details">
            <summary><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ item.name }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ item.category }} · {{ item.apartmentCount }}</p></div><div class="text-right"><p class="font-semibold tabular-nums">{{ t('reports.buy') }} {{ quantity(item.toPurchase, item.unit) }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('reports.currentTotal') }} {{ quantity(item.currentQuantity, item.unit) }}</p></div><UIcon name="i-lucide-chevron-down" class="report-details__chevron size-5" /></summary>
            <div class="report-detail-list"><div v-for="apartment in item.apartments" :key="apartment.apartmentId" class="report-detail-row"><div><p class="font-medium">{{ apartment.apartmentName }}</p><p class="text-sm text-[var(--color-muted)]">{{ apartment.hotelName }}</p></div><div class="text-right text-sm"><p><span class="text-[var(--color-muted)]">{{ t('reports.current') }}</span> {{ quantity(apartment.currentQuantity, item.unit) }}</p><p class="font-semibold text-[var(--color-primary-strong)]">+ {{ quantity(apartment.toPurchase, item.unit) }}</p></div></div></div>
          </details>
        </div>
            <EmptyState v-else icon="i-lucide-circle-check" :title="t('reports.purchaseNotRequired')" :description="t('reports.selectedAboveThreshold')" />
      </div>

      <div v-else-if="activeTab === 'workload'" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2"><MetricTile :label="t('reports.overdueTasks')" :value="report.workload.overdueTasks.length" icon="i-lucide-clock-alert" :tone="report.workload.overdueTasks.length ? 'danger' : 'neutral'" /><MetricTile :label="t('reports.undatedTasks')" :value="report.workload.undatedTasks.length" icon="i-lucide-list-todo" /></div>
        <div v-if="report.workload.days.length" class="grid gap-4 xl:grid-cols-2">
          <article v-for="day in report.workload.days" :key="day.date" class="surface overflow-hidden"><div class="report-day-heading"><div><h2>{{ formatDate(day.date) }}</h2><p>{{ day.arrivals }} {{ t('calendar.arrival').toLocaleLowerCase() }} · {{ day.departures }} {{ t('calendar.departure').toLocaleLowerCase() }}</p></div><StatusBadge :label="`${dayLoad(day)} ${t('work.tasks').toLocaleLowerCase()}`" :tone="dayLoad(day) > 4 ? 'warning' : 'info'" /></div><div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="cleaning in day.cleanings" :key="cleaning.id" class="report-work-row"><div class="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-sparkles" class="size-4" /></div><div class="min-w-0 flex-1"><p class="truncate font-medium">{{ cleaning.apartmentName }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaning.hotelName }} · {{ cleaning.cleaners.join(', ') || t('work.notAssigned') }}</p></div><StatusBadge :label="cleaningLabels[cleaning.status] ?? cleaning.status" :tone="cleaningTone(cleaning.status)" /></div><div v-for="task in day.tasks" :key="task.id" class="report-work-row"><div class="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf3f7] text-[#356882]"><UIcon name="i-lucide-clipboard-check" class="size-4" /></div><div class="min-w-0 flex-1"><p class="truncate font-medium">{{ task.title }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ task.apartmentName }} · {{ task.assigneeName ?? t('work.notAssigned') }}</p></div><StatusBadge :label="taskLabels[task.status] ?? task.status" :tone="taskTone(task.status)" /></div></div></article>
        </div>
        <EmptyState v-else icon="i-lucide-calendar-check" :title="t('reports.noWorkload')" :description="t('reports.noWorkloadDescription')" />
        <section v-if="report.workload.overdueTasks.length || report.workload.undatedTasks.length" class="surface p-5 sm:p-6"><h2 class="text-lg font-semibold">{{ t('reports.attention') }}</h2><div class="mt-4 grid gap-3 lg:grid-cols-2"><div v-if="report.workload.overdueTasks.length" class="report-attention report-attention--danger"><strong>{{ t('reports.overdueTasks') }}</strong><p v-for="item in report.workload.overdueTasks" :key="item.id">{{ item.title }} · {{ item.apartmentName }}</p></div><div v-if="report.workload.undatedTasks.length" class="report-attention"><strong>{{ t('reports.undatedTasks') }}</strong><p v-for="item in report.workload.undatedTasks" :key="item.id">{{ item.title }} · {{ item.apartmentName }}</p></div></div></section>
      </div>

      <div v-else class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricTile :label="t('reports.operatingExpenses')" :value="formatEuro(report.finance.operatingExpensesEur)" icon="i-lucide-receipt-euro" /><MetricTile :label="t('reports.extraServices')" :value="formatEuro(report.finance.guestServicesEur)" icon="i-lucide-concierge-bell" /><MetricTile :label="t('reports.cleaning')" :value="formatEuro(report.finance.cleaningComponents.cleanerPoolEur)" icon="i-lucide-sparkles" /><MetricTile :label="t('reports.laundryService')" :value="formatEuro(report.finance.cleaningComponents.laundryEur + report.finance.cleaningComponents.serviceEur)" icon="i-lucide-washing-machine" /></div>
        <div class="grid gap-6 xl:grid-cols-2"><section class="surface overflow-hidden"><div class="report-section-heading"><div><h2>{{ t('reports.byCategories') }}</h2><p>{{ t('reports.operationsStructure') }}</p></div></div><div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="row in report.finance.byType" :key="row.id" class="report-compact-row"><span>{{ row.label }}</span><strong class="tabular-nums">{{ formatEuro(row.amountEur) }}</strong></div></div></section><section class="surface overflow-hidden"><div class="report-section-heading"><div><h2>{{ t('reports.byHotels') }}</h2><p>{{ t('reports.allOperations') }}</p></div></div><div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><div v-for="row in report.finance.byHotel" :key="row.id" class="report-compact-row"><span>{{ row.label }}</span><strong class="tabular-nums">{{ formatEuro(row.amountEur) }}</strong></div></div></section></div>
        <section class="surface overflow-hidden"><div class="report-section-heading"><div><h2>{{ t('reports.allOperations') }}</h2><p>{{ report.finance.entries.length }} {{ t('reports.operationsStructure').toLocaleLowerCase() }}</p></div></div><div v-if="report.finance.entries.length" class="report-finance-table"><div class="report-finance-head"><span>{{ t('reports.dateAndCategory') }}</span><span>{{ t('reports.property') }}</span><span>{{ t('reports.managers') }}</span><span>{{ t('reports.amount') }}</span></div><div v-for="entry in report.finance.entries" :key="entry.id" class="report-finance-row"><div><p class="font-medium">{{ formatDate(entry.occurredOn) }}</p><p>{{ financeTypeLabels[entry.type] ?? entry.type }}</p></div><div><p class="font-medium">{{ entry.apartmentName }}</p><p>{{ entry.hotelName }}</p></div><div><p class="font-medium">{{ entry.managerNames.join(', ') || t('work.notAssigned') }}</p><p>{{ entry.description }}</p></div><strong>{{ formatEuro(entry.amountEur) }}</strong></div></div><EmptyState v-else icon="i-lucide-receipt" :title="t('reports.noOperations')" :description="t('reports.noOperationsDescription')" /></section>
      </div>
    </template>
  </section>
</template>
