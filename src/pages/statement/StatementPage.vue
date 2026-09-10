<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ApartmentSelect, matchesApartmentSearch } from '#fsd/features/select-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatEuro } from '#fsd/shared/lib'
import { EmptyState, MonthInput, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { downloadManagerExpensePdf } from './lib/manager-expense-pdf'
import { createManagerExpenseCategoryVisibility, managerExpenseCategories, managerExpenseReportTotal, updateManagerExpenseCategoryVisibility, type ManagerExpenseCategory, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine } from './model/manager-expense-report'
import ManagerExpenseReportPreview from './ui/ManagerExpenseReportPreview.vue'
import { useI18n } from 'vue-i18n'

type Category = ManagerExpenseCategory
type Line = ManagerExpenseLine
type Report = { apartment: { id: string, name: string, managerNames: string[] }, month: string, materialized: boolean, published: boolean, publishedAt: string | null, categoryVisibility: ManagerExpenseCategoryVisibility, lines: Line[], totalEur: number }
type Summary = { apartmentId: string, apartmentName: string, hotelName: string, managerNames: string[], materialized: boolean, published: boolean, totalEur: number }
const user = useCurrentUser()
const { t } = useI18n()
const route = useRoute()
const month = ref(typeof route.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(route.query.month) ? route.query.month : new Date().toISOString().slice(0, 7))
const selectedApartmentId = ref(typeof route.query.apartmentId === 'string' ? route.query.apartmentId : '')
const apartmentSearch = ref('')
const reports = ref<Summary[]>([])
const report = ref<Report | null>(null)
const draftLines = ref<Line[]>([])
const draftCategoryVisibility = ref<ManagerExpenseCategoryVisibility>(createManagerExpenseCategoryVisibility())
const pending = ref(false)
const loading = ref(false)
const error = ref('')
const resetOpen = ref(false)
const pdfPending = ref(false)
const editingLineId = ref<string | null>(null)
const inventoryExpanded = ref(false)
const isAdministrator = computed(() => user.value?.roles.includes('administrator') ?? false)
const reportTitle = computed(() => {
  const summary = reports.value.find(item => item.apartmentId === report.value?.apartment.id)
  return summary ? `${summary.hotelName} · ${summary.apartmentName}` : report.value?.apartment.name ?? ''
})
const filteredReports = computed(() => {
  if (!apartmentSearch.value.trim()) return reports.value
  return reports.value.filter(item => matchesApartmentSearch({ name: item.apartmentName, hotelName: item.hotelName }, apartmentSearch.value))
})
const categoryLabels: Record<Category, string> = { cleaning: t('work.cleanings'), inventory: t('reports.procurement'), task: t('work.tasks'), other: t('reports.finance') }
const totalEur = computed(() => managerExpenseReportTotal(draftLines.value, draftCategoryVisibility.value))
const hasUnsavedChanges = computed(() => {
  if (!report.value) return false
  const saved = { categoryVisibility: report.value.categoryVisibility, lines: report.value.lines.map(({ category, description, occurredOn, amountEur, position, included, problemId }) => ({ category, description, occurredOn, amountEur, position, included, problemId })) }
  const draft = { categoryVisibility: draftCategoryVisibility.value, lines: draftLines.value.map(({ category, description, occurredOn, amountEur, position, included, problemId }) => ({ category, description, occurredOn, amountEur, position, included, problemId })) }
  return JSON.stringify(saved) !== JSON.stringify(draft)
})
const addItems = computed<DropdownMenuItem[][]>(() => [managerExpenseCategories.map(category => ({ label: categoryLabels[category], icon: category === 'cleaning' ? 'i-lucide-broom' : category === 'inventory' ? 'i-lucide-package' : category === 'task' ? 'i-lucide-wrench' : 'i-lucide-receipt-euro', onSelect: () => addLine(category) }))])

async function refreshList() {
  if (!user.value) return
  loading.value = true; error.value = ''
  try {
    reports.value = await $fetch<Summary[]>('/api/finance/manager-expense-reports', { query: { month: month.value } })
    if (!reports.value.some(item => item.apartmentId === selectedApartmentId.value)) selectedApartmentId.value = reports.value[0]?.apartmentId ?? ''
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error'); reports.value = []; selectedApartmentId.value = '' }
  finally { loading.value = false }
}
async function loadReport() {
  if (!selectedApartmentId.value || !user.value) { report.value = null; draftLines.value = []; draftCategoryVisibility.value = createManagerExpenseCategoryVisibility(); return }
  loading.value = true; error.value = ''
  try {
    report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${selectedApartmentId.value}`, { query: { month: month.value } })
    draftLines.value = report.value.lines.map(line => ({ ...line })); draftCategoryVisibility.value = { ...report.value.categoryVisibility }; editingLineId.value = null; inventoryExpanded.value = false
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error'); report.value = null; draftLines.value = []; draftCategoryVisibility.value = createManagerExpenseCategoryVisibility() }
  finally { loading.value = false }
}
async function reload() { await refreshList(); await loadReport() }
async function save() {
  if (!report.value) return
  pending.value = true; error.value = ''
  try { report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${report.value.apartment.id}`, { method: 'PUT', body: { month: month.value, categoryVisibility: draftCategoryVisibility.value, lines: draftLines.value.map(({ category, description, occurredOn, amountEur, included, problemId }) => ({ category, description, occurredOn, amountEur, included, problemId })) } }); draftLines.value = report.value.lines.map(line => ({ ...line })); draftCategoryVisibility.value = { ...report.value.categoryVisibility }; editingLineId.value = null; await refreshList() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function action(action: 'publish' | 'unpublish' | 'reset') {
  if (!report.value) return
  pending.value = true; error.value = ''
  try { report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${report.value.apartment.id}/${action}`, { method: 'POST', body: { month: month.value } }); draftLines.value = report.value.lines.map(line => ({ ...line })); draftCategoryVisibility.value = { ...report.value.categoryVisibility }; await refreshList() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false; resetOpen.value = false }
}
function addLine(category: Category) { const line = { id: `new-${crypto.randomUUID()}`, category, description: '', occurredOn: null, amountEur: 0, position: draftLines.value.length, included: true, problemId: null }; draftLines.value.push(line); editingLineId.value = line.id; if (category === 'inventory') inventoryExpanded.value = true }
function updateLine(id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>) { const line = draftLines.value.find(item => item.id === id); if (line) Object.assign(line, patch) }
function removeLine(id: string) { draftLines.value = draftLines.value.filter(line => line.id !== id); editingLineId.value = null }
function setCategoryVisibility(category: Category, enabled: boolean) { draftCategoryVisibility.value = updateManagerExpenseCategoryVisibility(draftCategoryVisibility.value, category, enabled) }
function setLineIncluded(id: string, included: boolean) { const line = draftLines.value.find(item => item.id === id); if (line) line.included = included }
function toggleInventory() {
  inventoryExpanded.value = !inventoryExpanded.value
  if (!inventoryExpanded.value && draftLines.value.find(line => line.id === editingLineId.value)?.category === 'inventory') editingLineId.value = null
}
async function downloadPdf() {
  if (!report.value || (isAdministrator.value && hasUnsavedChanges.value)) return
  pdfPending.value = true; error.value = ''
  try {
    await downloadManagerExpensePdf({ apartmentName: report.value.apartment.name, month: report.value.month, lines: report.value.lines, categoryVisibility: report.value.categoryVisibility })
  } catch (cause: any) { error.value = cause?.message ?? t('common.error') }
  finally { pdfPending.value = false }
}
onMounted(() => {
  watch([month, user], async () => { await refreshList(); await loadReport() }, { immediate: true })
  watch(selectedApartmentId, loadReport)
})
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="isAdministrator ? t('statementExtra.reports') : t('statementExtra.myExpenses')">
      <template #actions><div class="flex flex-wrap items-center gap-2"><MonthInput v-model="month" /><UButton v-if="!isAdministrator && report" color="neutral" variant="outline" icon="i-lucide-download" class="min-h-11" :loading="pdfPending" @click="downloadPdf">{{ t('statementExtra.downloadPdf') }}</UButton></div></template>
    </PageHeader>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <template v-if="isAdministrator">
      <div v-if="loading && !reports.length" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="reports.length" class="manager-expense-layout grid gap-3">
        <aside class="surface overflow-hidden">
          <div class="border-b border-[var(--color-line)] p-3"><UInput v-model="apartmentSearch" icon="i-lucide-search" :placeholder="t('common.searchApartment')" :aria-label="t('common.searchApartment')" /></div>
          <div v-if="filteredReports.length" class="divide-y divide-[var(--color-line)]">
            <button v-for="item in filteredReports" :key="item.apartmentId" type="button" class="manager-expense-report-option flex min-h-18 w-full flex-col justify-center px-4 py-3 text-left" :aria-pressed="selectedApartmentId === item.apartmentId" aria-controls="manager-expense-report-detail" :aria-expanded="selectedApartmentId === item.apartmentId && Boolean(report)" @click="selectedApartmentId = item.apartmentId">
              <span class="flex w-full min-w-0 items-baseline justify-between gap-3"><strong class="min-w-0 truncate">{{ item.hotelName }} · {{ item.apartmentName }}</strong><strong class="shrink-0 text-right tabular-nums">{{ formatEuro(item.totalEur) }}</strong></span>
              <span class="mt-0.5 flex w-full min-w-0 items-baseline justify-between gap-3"><span class="min-w-0 truncate text-sm text-[var(--color-muted)]">{{ item.managerNames.join(', ') || t('statementExtra.managersMissing') }}</span><span class="shrink-0 text-right text-xs" :class="item.published ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'">{{ item.published ? t('statementExtra.accessOpen') : t('statementExtra.draft') }}</span></span>
            </button>
          </div>
          <p v-else class="px-4 py-5 text-sm text-[var(--color-muted)]">{{ t('common.noApartmentsFound') }}</p>
        </aside>
        <div v-if="report" id="manager-expense-report-detail" class="surface overflow-hidden">
          <div class="manager-expense-toolbar border-b border-[var(--color-line)] p-4 sm:p-5">
            <div class="manager-expense-toolbar__heading flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
              <div class="min-w-0"><h2 class="truncate font-semibold">{{ reportTitle }}</h2><p class="mt-1 truncate text-sm text-[var(--color-muted)]">{{ report.apartment.managerNames.join(', ') || t('statementExtra.managersPending') }}</p></div>
            </div>
            <div class="manager-expense-toolbar__controls">
              <StatusBadge class="manager-expense-toolbar__status" :label="report.published ? t('statementExtra.accessOpen') : t('statementExtra.draft')" :tone="report.published ? 'success' : 'neutral'" />
              <div class="manager-expense-actions">
                <UDropdownMenu :items="addItems" :content="{ align: 'end' }" :modal="false"><UButton color="neutral" variant="outline" icon="i-lucide-plus" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.addExpense')" :title="t('statementExtra.addExpense')" /></UDropdownMenu>
                <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.rebuild')" :title="t('statementExtra.rebuild')" :loading="pending" @click="resetOpen = true" />
                <UButton color="neutral" variant="outline" icon="i-lucide-file-down" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.downloadPdf')" :loading="pdfPending" :disabled="hasUnsavedChanges" :title="hasUnsavedChanges ? t('statementExtra.saveFirst') : t('statementExtra.downloadPdf')" @click="downloadPdf" />
                <UButton icon="i-lucide-save" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.save')" :title="t('statementExtra.save')" :loading="pending" @click="save" />
                <UButton v-if="!report.published" color="primary" variant="solid" icon="i-lucide-lock-open" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.grantAccess')" :title="t('statementExtra.grantAccess')" :loading="pending" @click="action('publish')" />
                <UButton v-else color="error" variant="outline" icon="i-lucide-lock" class="min-h-11 min-w-11 transition-transform active:scale-[0.96]" :aria-label="t('statementExtra.closeAccess')" :title="t('statementExtra.closeAccess')" :loading="pending" @click="action('unpublish')" />
              </div>
            </div>
          </div>
          <div class="px-4 pt-3 sm:px-5"><p class="text-sm font-medium text-[var(--color-muted)]">{{ t('statementExtra.previewHint') }}</p></div>
          <ManagerExpenseReportPreview embedded :lines="draftLines" :total-eur="totalEur" :category-visibility="draftCategoryVisibility" editable :editing-line-id="editingLineId" :inventory-expanded="inventoryExpanded" @select="editingLineId = $event" @toggle-inventory="toggleInventory" @update-category-visibility="setCategoryVisibility" @update-included="setLineIncluded" @close="editingLineId = null" @update="(id, patch) => updateLine(id, patch)" @remove="removeLine" />
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-building-2"  :title="t('statementExtra.noApartments')" :description="t('statementExtra.addApartments')" />
    </template>
    <div v-else class="manager-expense-manager-view grid gap-4 sm:gap-5">
      <ApartmentSelect v-if="reports.length > 1" v-model="selectedApartmentId" :apartments="reports.map(item => ({ id: item.apartmentId, name: item.apartmentName, hotel: { name: item.hotelName } }))" class="w-full sm:w-80" />
      <ManagerExpenseReportPreview v-if="report" :lines="report.lines" :total-eur="report.totalEur" :category-visibility="report.categoryVisibility" />
      <EmptyState v-else-if="!loading" icon="i-lucide-receipt-euro"  :title="t('statementExtra.unavailable')" :description="t('statementExtra.unavailableDescription')" />
    </div>
    <UModal v-model:open="resetOpen" :title="t('statementExtra.rebuildQuestion')"><template #body><div class="space-y-5"><p>{{ t('statementExtra.rebuildDescription') }}</p><div class="form-actions"><UButton color="neutral" variant="ghost" @click="resetOpen = false">{{ t('common.cancel') }}</UButton><UButton color="error" :loading="pending" @click="action('reset')">{{ t('statementExtra.rebuild') }}</UButton></div></div></template></UModal>
  </section>
</template>

<style scoped>
.manager-expense-report-option {
  cursor: pointer;
  transition-property: background-color, box-shadow;
  transition-duration: 150ms;
}
.manager-expense-report-option:hover {
  background: var(--color-surface-muted);
}
.manager-expense-report-option:active,
.manager-expense-report-option[aria-pressed="true"],
.manager-expense-report-option[aria-pressed="true"]:hover {
  background: var(--color-primary-soft);
}
.manager-expense-report-option[aria-pressed="true"] {
  box-shadow: inset 3px 0 0 var(--color-primary);
}
.manager-expense-report-option:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.manager-expense-toolbar__controls {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
}
.manager-expense-toolbar__status {
  align-self: flex-start;
}
@media (min-width: 1024px) {
  .manager-expense-layout {
    grid-template-columns: 19rem minmax(0, 1fr);
  }
  .manager-expense-toolbar__controls {
    width: auto;
    flex-direction: row;
    align-items: center;
    margin-inline-start: auto;
  }
  .manager-expense-toolbar__status {
    align-self: center;
  }
}
</style>
