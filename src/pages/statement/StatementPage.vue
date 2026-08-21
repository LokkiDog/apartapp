<script setup lang="ts">
import Decimal from 'decimal.js'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatEuro } from '#fsd/shared/lib'
import { EmptyState, PageHeader } from '#fsd/shared/ui'
import ManagerExpenseReportPreview from './ui/ManagerExpenseReportPreview.vue'

type Category = 'cleaning' | 'inventory' | 'task'
type Line = { id: string, category: Category, description: string, occurredOn: string | null, amountEur: number, position: number }
type Report = { apartment: { id: string, name: string, managerName: string | null }, month: string, materialized: boolean, published: boolean, publishedAt: string | null, lines: Line[], totalEur: number }
type Summary = { apartmentId: string, apartmentName: string, managerName: string | null, materialized: boolean, published: boolean, totalEur: number }
const user = useCurrentUser()
const route = useRoute()
const month = ref(typeof route.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(route.query.month) ? route.query.month : new Date().toISOString().slice(0, 7))
const selectedApartmentId = ref(typeof route.query.apartmentId === 'string' ? route.query.apartmentId : '')
const reports = ref<Summary[]>([])
const report = ref<Report | null>(null)
const draftLines = ref<Line[]>([])
const pending = ref(false)
const loading = ref(false)
const error = ref('')
const resetOpen = ref(false)
const editingLineId = ref<string | null>(null)
const inventoryExpanded = ref(false)
const isAdministrator = computed(() => user.value?.roles.includes('administrator') ?? false)
const categoryLabels: Record<Category, string> = { cleaning: 'Уборки', inventory: 'Расходники', task: 'Дополнительные работы' }
const categories: Category[] = ['cleaning', 'inventory', 'task']
const totalEur = computed(() => Number(draftLines.value.reduce((sum, line) => sum.plus(line.amountEur || 0), new Decimal(0)).toDecimalPlaces(2)))
const addItems = computed<DropdownMenuItem[][]>(() => [categories.map(category => ({ label: categoryLabels[category], icon: category === 'cleaning' ? 'i-lucide-sparkles' : category === 'inventory' ? 'i-lucide-package' : 'i-lucide-wrench', onSelect: () => addLine(category) }))])

async function refreshList() {
  if (!user.value) return
  loading.value = true; error.value = ''
  try {
    reports.value = await $fetch<Summary[]>('/api/finance/manager-expense-reports', { query: { month: month.value } })
    if (!reports.value.some(item => item.apartmentId === selectedApartmentId.value)) selectedApartmentId.value = reports.value[0]?.apartmentId ?? ''
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось загрузить отчёты'; reports.value = []; selectedApartmentId.value = '' }
  finally { loading.value = false }
}
async function loadReport() {
  if (!selectedApartmentId.value || !user.value) { report.value = null; draftLines.value = []; return }
  loading.value = true; error.value = ''
  try {
    report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${selectedApartmentId.value}`, { query: { month: month.value } })
    draftLines.value = report.value.lines.map(line => ({ ...line })); editingLineId.value = null; inventoryExpanded.value = false
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось загрузить отчёт'; report.value = null; draftLines.value = [] }
  finally { loading.value = false }
}
async function reload() { await refreshList(); await loadReport() }
async function save() {
  if (!report.value) return
  pending.value = true; error.value = ''
  try { report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${report.value.apartment.id}`, { method: 'PUT', body: { month: month.value, lines: draftLines.value.map(({ category, description, occurredOn, amountEur }) => ({ category, description, occurredOn, amountEur })) } }); draftLines.value = report.value.lines.map(line => ({ ...line })); editingLineId.value = null; await refreshList() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить отчёт' }
  finally { pending.value = false }
}
async function action(action: 'publish' | 'unpublish' | 'reset') {
  if (!report.value) return
  pending.value = true; error.value = ''
  try { report.value = await $fetch<Report>(`/api/finance/manager-expense-reports/${report.value.apartment.id}/${action}`, { method: 'POST', body: { month: month.value } }); draftLines.value = report.value.lines.map(line => ({ ...line })); await refreshList() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось обновить доступ' }
  finally { pending.value = false; resetOpen.value = false }
}
function addLine(category: Category) { const line = { id: `new-${crypto.randomUUID()}`, category, description: '', occurredOn: null, amountEur: 0, position: draftLines.value.length }; draftLines.value.push(line); editingLineId.value = line.id; if (category === 'inventory') inventoryExpanded.value = true }
function updateLine(id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>) { const line = draftLines.value.find(item => item.id === id); if (line) Object.assign(line, patch) }
function removeLine(id: string) { draftLines.value = draftLines.value.filter(line => line.id !== id); editingLineId.value = null }
function toggleInventory() {
  inventoryExpanded.value = !inventoryExpanded.value
  if (!inventoryExpanded.value && draftLines.value.find(line => line.id === editingLineId.value)?.category === 'inventory') editingLineId.value = null
}
onMounted(() => {
  watch([month, user], async () => { await refreshList(); await loadReport() }, { immediate: true })
  watch(selectedApartmentId, loadReport)
})
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="isAdministrator ? 'Расходы управляющих' : 'Мои расходы'" :description="isAdministrator ? 'Подготовьте и откройте управляющему месячный отчёт по апартаменту.' : 'Опубликованные отчёты по закреплённым за вами апартаментам.'">
      <template #actions><UInput v-model="month" type="month" class="w-44" /></template>
    </PageHeader>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <template v-if="isAdministrator">
      <div v-if="loading && !reports.length" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="reports.length" class="manager-expense-layout grid gap-3">
        <aside class="surface divide-y divide-[var(--color-line)] overflow-hidden">
          <button v-for="item in reports" :key="item.apartmentId" type="button" class="flex min-h-18 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)]" :class="{ 'bg-[var(--color-primary-soft)]': selectedApartmentId === item.apartmentId }" @click="selectedApartmentId = item.apartmentId">
            <span class="min-w-0"><strong class="block truncate">{{ item.apartmentName }}</strong><span class="mt-0.5 block truncate text-sm text-[var(--color-muted)]">{{ item.managerName ?? 'Управляющий не назначен' }}</span></span>
            <span class="shrink-0 text-right"><strong class="block tabular-nums">{{ formatEuro(item.totalEur) }}</strong><span class="mt-0.5 block text-xs" :class="item.published ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'">{{ item.published ? 'Доступ открыт' : 'Черновик' }}</span></span>
          </button>
        </aside>
        <div v-if="report" class="surface overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4 sm:p-5">
            <div class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <div class="min-w-0"><h2 class="truncate font-semibold">{{ report.apartment.name }}</h2><p class="mt-1 truncate text-sm text-[var(--color-muted)]">{{ report.apartment.managerName ?? 'Управляющий пока не назначен' }}</p></div>
              <span class="text-sm" :class="report.published ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'">{{ report.published ? 'Доступ открыт' : report.materialized ? 'Сохранённый черновик' : 'Автоматический черновик' }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 sm:justify-end">
              <UDropdownMenu :items="addItems" :content="{ align: 'end' }"><UButton color="neutral" variant="outline" icon="i-lucide-plus" class="min-h-11">Добавить расход</UButton></UDropdownMenu>
              <UButton color="neutral" variant="outline" class="min-h-11" :loading="pending" @click="resetOpen = true">Пересобрать из операций</UButton>
              <UButton class="min-h-11" :loading="pending" @click="save">Сохранить</UButton>
              <UButton v-if="!report.published" color="primary" variant="solid" class="min-h-11" :loading="pending" @click="action('publish')">Дать доступ</UButton>
              <UButton v-else color="error" variant="outline" class="min-h-11" :loading="pending" @click="action('unpublish')">Закрыть доступ</UButton>
            </div>
          </div>
          <div class="px-4 pt-3 sm:px-5"><p class="text-sm font-medium text-[var(--color-muted)]">Превью для управляющего · нажмите на строку, чтобы изменить её</p></div>
          <ManagerExpenseReportPreview embedded :lines="draftLines" :total-eur="totalEur" editable :editing-line-id="editingLineId" :inventory-expanded="inventoryExpanded" @select="editingLineId = $event" @toggle-inventory="toggleInventory" @close="editingLineId = null" @update="(id, patch) => updateLine(id, patch)" @remove="removeLine" />
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-building-2" title="Апартаментов нет" description="Добавьте апартаменты, чтобы подготовить отчёты." />
    </template>
    <template v-else>
      <USelect v-if="reports.length > 1" v-model="selectedApartmentId" :items="reports.map(item => ({ label: item.apartmentName, value: item.apartmentId }))" class="w-full sm:w-80" />
      <ManagerExpenseReportPreview v-if="report" :lines="report.lines" :total-eur="report.totalEur" />
      <EmptyState v-else-if="!loading" icon="i-lucide-receipt-euro" title="Отчёты пока недоступны" description="Администратор откроет доступ к отчёту за выбранный месяц, когда он будет готов." />
    </template>
    <UModal v-model:open="resetOpen" title="Пересобрать отчёт?"><template #body><div class="space-y-5"><p>Ручные строки будут заменены актуальными расходами из CRM. Это действие нельзя отменить.</p><div class="form-actions"><UButton color="neutral" variant="ghost" @click="resetOpen = false">Отмена</UButton><UButton color="error" :loading="pending" @click="action('reset')">Пересобрать</UButton></div></div></template></UModal>
  </section>
</template>

<style scoped>
@media (min-width: 1024px) {
  .manager-expense-layout {
    grid-template-columns: 19rem minmax(0, 1fr);
  }
}
</style>
