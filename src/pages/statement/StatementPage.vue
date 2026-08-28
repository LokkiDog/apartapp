<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatEuro } from '#fsd/shared/lib'
import { EmptyState, PageHeader } from '#fsd/shared/ui'
import { downloadManagerExpensePdf } from './lib/manager-expense-pdf'
import { createManagerExpenseCategoryVisibility, managerExpenseCategories, managerExpenseReportTotal, updateManagerExpenseCategoryVisibility, type ManagerExpenseCategory, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine } from './model/manager-expense-report'
import ManagerExpenseReportPreview from './ui/ManagerExpenseReportPreview.vue'
import { useI18n } from 'vue-i18n'

type Category = ManagerExpenseCategory
type Line = ManagerExpenseLine
type Report = { apartment: { id: string, name: string, managerNames: string[] }, month: string, materialized: boolean, published: boolean, publishedAt: string | null, categoryVisibility: ManagerExpenseCategoryVisibility, lines: Line[], totalEur: number }
type Summary = { apartmentId: string, apartmentName: string, managerNames: string[], materialized: boolean, published: boolean, totalEur: number }
const user = useCurrentUser()
const { t } = useI18n()
const route = useRoute()
const month = ref(typeof route.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(route.query.month) ? route.query.month : new Date().toISOString().slice(0, 7))
const selectedApartmentId = ref(typeof route.query.apartmentId === 'string' ? route.query.apartmentId : '')
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
const categoryLabels: Record<Category, string> = { cleaning: t('work.cleanings'), inventory: t('reports.procurement'), task: t('work.tasks'), other: t('reports.finance') }
const totalEur = computed(() => managerExpenseReportTotal(draftLines.value, draftCategoryVisibility.value))
const hasUnsavedChanges = computed(() => {
  if (!report.value) return false
  const saved = { categoryVisibility: report.value.categoryVisibility, lines: report.value.lines.map(({ category, description, occurredOn, amountEur, position }) => ({ category, description, occurredOn, amountEur, position })) }
  const draft = { categoryVisibility: draftCategoryVisibility.value, lines: draftLines.value.map(({ category, description, occurredOn, amountEur, position }) => ({ category, description, occurredOn, amountEur, position })) }
  return JSON.stringify(saved) !== JSON.stringify(draft)
})
const addItems = computed<DropdownMenuItem[][]>(() => [managerExpenseCategories.map(category => ({ label: categoryLabels[category], icon: category === 'cleaning' ? 'i-lucide-sparkles' : category === 'inventory' ? 'i-lucide-package' : category === 'task' ? 'i-lucide-wrench' : 'i-lucide-receipt-euro', onSelect: () => addLine(category) }))])

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
  try { report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${report.value.apartment.id}`, { method: 'PUT', body: { month: month.value, categoryVisibility: draftCategoryVisibility.value, lines: draftLines.value.map(({ category, description, occurredOn, amountEur }) => ({ category, description, occurredOn, amountEur })) } }); draftLines.value = report.value.lines.map(line => ({ ...line })); draftCategoryVisibility.value = { ...report.value.categoryVisibility }; editingLineId.value = null; await refreshList() }
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
function addLine(category: Category) { const line = { id: `new-${crypto.randomUUID()}`, category, description: '', occurredOn: null, amountEur: 0, position: draftLines.value.length }; draftLines.value.push(line); editingLineId.value = line.id; if (category === 'inventory') inventoryExpanded.value = true }
function updateLine(id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>) { const line = draftLines.value.find(item => item.id === id); if (line) Object.assign(line, patch) }
function removeLine(id: string) { draftLines.value = draftLines.value.filter(line => line.id !== id); editingLineId.value = null }
function setCategoryVisibility(category: Category, enabled: boolean) { draftCategoryVisibility.value = updateManagerExpenseCategoryVisibility(draftCategoryVisibility.value, category, enabled) }
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
      <template #actions><div class="flex flex-wrap items-center gap-2"><UInput v-model="month" type="month" class="w-44" /><UButton v-if="!isAdministrator && report" color="neutral" variant="outline" icon="i-lucide-download" class="min-h-11" :loading="pdfPending" @click="downloadPdf">{{ t('statementExtra.downloadPdf') }}</UButton></div></template>
    </PageHeader>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <template v-if="isAdministrator">
      <div v-if="loading && !reports.length" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="reports.length" class="manager-expense-layout grid gap-3">
        <aside class="surface divide-y divide-[var(--color-line)] overflow-hidden">
          <button v-for="item in reports" :key="item.apartmentId" type="button" class="flex min-h-18 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)]" :class="{ 'bg-[var(--color-primary-soft)]': selectedApartmentId === item.apartmentId }" @click="selectedApartmentId = item.apartmentId">
            <span class="min-w-0"><strong class="block truncate">{{ item.apartmentName }}</strong><span class="mt-0.5 block truncate text-sm text-[var(--color-muted)]">{{ item.managerNames.join(', ') || t('statementExtra.managersMissing') }}</span></span>
            <span class="shrink-0 text-right"><strong class="block tabular-nums">{{ formatEuro(item.totalEur) }}</strong><span class="mt-0.5 block text-xs" :class="item.published ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'">{{ item.published ? t('statementExtra.accessOpen') : t('statementExtra.draft') }}</span></span>
          </button>
        </aside>
        <div v-if="report" class="surface overflow-hidden">
          <div class="manager-expense-toolbar border-b border-[var(--color-line)] p-4 sm:p-5">
            <div class="manager-expense-toolbar__heading flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <div class="min-w-0"><h2 class="truncate font-semibold">{{ report.apartment.name }}</h2><p class="mt-1 truncate text-sm text-[var(--color-muted)]">{{ report.apartment.managerNames.join(', ') || t('statementExtra.managersPending') }}</p></div>
              <span class="text-sm" :class="report.published ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'">{{ report.published ? t('statementExtra.accessOpen') : report.materialized ? t('statementExtra.savedDraft') : t('statementExtra.automaticDraft') }}</span>
            </div>
            <div class="manager-expense-actions">
              <UDropdownMenu :items="addItems" :content="{ align: 'end' }"><UButton color="neutral" variant="outline" icon="i-lucide-plus" class="min-h-11">{{ t('statementExtra.addExpense') }}</UButton></UDropdownMenu>
              <UButton color="neutral" variant="outline" class="min-h-11" :loading="pending" @click="resetOpen = true">{{ t('statementExtra.rebuild') }}</UButton>
              <UButton class="min-h-11" :loading="pending" @click="save">{{ t('statementExtra.save') }}</UButton>
              <UButton color="neutral" variant="outline" icon="i-lucide-download" class="min-h-11" :loading="pdfPending" :disabled="hasUnsavedChanges" :title="hasUnsavedChanges ? t('statementExtra.saveFirst') : undefined" @click="downloadPdf">{{ t('statementExtra.downloadPdf') }}</UButton>
              <UButton v-if="!report.published" color="primary" variant="solid" class="min-h-11" :loading="pending" @click="action('publish')">{{ t('statementExtra.grantAccess') }}</UButton>
              <UButton v-else color="error" variant="outline" class="min-h-11" :loading="pending" @click="action('unpublish')">{{ t('statementExtra.closeAccess') }}</UButton>
            </div>
          </div>
          <div class="px-4 pt-3 sm:px-5"><p class="text-sm font-medium text-[var(--color-muted)]">{{ t('statementExtra.previewHint') }}</p></div>
          <ManagerExpenseReportPreview embedded :lines="draftLines" :total-eur="totalEur" :category-visibility="draftCategoryVisibility" editable :editing-line-id="editingLineId" :inventory-expanded="inventoryExpanded" @select="editingLineId = $event" @toggle-inventory="toggleInventory" @update-category-visibility="setCategoryVisibility" @close="editingLineId = null" @update="(id, patch) => updateLine(id, patch)" @remove="removeLine" />
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-building-2"  :title="t('statementExtra.noApartments')" :description="t('statementExtra.addApartments')" />
    </template>
    <div v-else class="manager-expense-manager-view grid gap-4 sm:gap-5">
      <USelect v-if="reports.length > 1" v-model="selectedApartmentId" :items="reports.map(item => ({ label: item.apartmentName, value: item.apartmentId }))" class="w-full sm:w-80" />
      <ManagerExpenseReportPreview v-if="report" :lines="report.lines" :total-eur="report.totalEur" :category-visibility="report.categoryVisibility" />
      <EmptyState v-else-if="!loading" icon="i-lucide-receipt-euro"  :title="t('statementExtra.unavailable')" :description="t('statementExtra.unavailableDescription')" />
    </div>
    <UModal v-model:open="resetOpen" :title="t('statementExtra.rebuildQuestion')"><template #body><div class="space-y-5"><p>{{ t('statementExtra.rebuildDescription') }}</p><div class="form-actions"><UButton color="neutral" variant="ghost" @click="resetOpen = false">{{ t('common.cancel') }}</UButton><UButton color="error" :loading="pending" @click="action('reset')">{{ t('statementExtra.rebuild') }}</UButton></div></div></template></UModal>
  </section>
</template>

<style scoped>
@media (min-width: 1024px) {
  .manager-expense-layout {
    grid-template-columns: 19rem minmax(0, 1fr);
  }
}
</style>
