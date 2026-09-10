<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import { ApartmentSelect } from '#fsd/features/select-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, DeleteConfirmModal, EmptyState, MoneyInput, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
import { useI18n } from 'vue-i18n'
import { consumableInputSchema } from '@contracts/crm'

type Stock = { id: string; consumable: { id: string; name: string; unit: string }; autoWriteOffQuantity: number | null; quantity: number; unitCostEur: number; minimumQuantity: number; targetQuantity: number; isLow: boolean }
type Consumable = { id: string; name: string; category: string; unit: string }
type InventoryDiscrepancy = { id: string; consumable: { id: string; name: string; unit: string }; cleaning: { id: string; apartment: { name: string; hotel: { name: string } } }; discrepancyQuantity: number; remainingQuantity: number; reportedAt: string }
const user = useCurrentUser()
const { t } = useI18n()
if (user.value?.roles.includes('manager') && !user.value.roles.includes('administrator')) await navigateTo('/')
const tab = ref<'stocks' | 'catalog'>('stocks')
const isAdministrator = computed(() => user.value?.roles.includes('administrator') ?? false)
const selectedApartment = ref('')
const { data: apartments } = await useAsyncData('inventory-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
watchEffect(() => { if (!selectedApartment.value && apartments.value?.[0]) selectedApartment.value = apartments.value[0].id })
const { data: stocks, refresh, status } = await useAsyncData('inventory-stocks', () => selectedApartment.value ? $fetch<Stock[]>(`/api/inventory/${selectedApartment.value}`) : Promise.resolve([]), { server: false, default: () => [], watch: [selectedApartment] })
const { data: consumables, refresh: refreshConsumables } = await useAsyncData('inventory-consumables', () => isAdministrator.value ? $fetch<Consumable[]>('/api/consumables') : Promise.resolve([] as Consumable[]), { server: false, default: () => [], watch: [isAdministrator] })
const { data: discrepancies, refresh: refreshDiscrepancies } = await useAsyncData('inventory-discrepancies', () => user.value?.roles.includes('administrator') ? $fetch<InventoryDiscrepancy[]>('/api/inventory/discrepancies') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const replenishOpen = ref(false), catalogOpen = ref(false), deleteOpen = ref(false), stockDeleteOpen = ref(false)
const pending = ref(false), error = ref('')
const approvalOpen = ref(false), approvalPending = ref(false), approvalError = ref('')
const replenish = reactive({ consumableId: '', quantity: 1, unitCostEur: 0 as number | null, note: '', minimumQuantity: 0, targetQuantity: 0 })
const catalog = reactive({ name: '', unit: 'шт.' })
const categoryPreset = ref('Уборка')
const customCategory = ref('')
const catalogValidation = useSubmitFormValidation()
const catalogValidationState = computed(() => ({
  ...catalog,
  category: categoryPreset.value === 'custom' ? customCategory.value : categoryPreset.value
}))
const validateCatalog = createFormValidator(consumableInputSchema, t)
const categoryItems = computed(() => [
  { label: t('inventoryCatalog.categoryCleaning'), value: 'Уборка' },
  { label: t('inventoryCatalog.categoryBathroom'), value: 'Ванная' },
  { label: t('inventoryCatalog.categoryKitchen'), value: 'Кухня' },
  { label: t('inventoryCatalog.categoryBedroom'), value: 'Спальня' },
  { label: t('inventoryCatalog.categoryGuest'), value: 'Гостевые принадлежности' },
  { label: t('inventoryCatalog.categoryCustom'), value: 'custom' }
])
const editingConsumableId = ref<string | null>(null)
const editingStockId = ref<string | null>(null)
const consumableToDelete = ref<Consumable | null>(null)
const discrepancyToApprove = ref<InventoryDiscrepancy | null>(null)
const replenishmentUnit = computed(() => consumables.value?.find(item => item.id === replenish.consumableId)?.unit ?? stocks.value?.find(item => item.consumable.id === replenish.consumableId)?.consumable.unit ?? '')

watchEffect(() => {
  if (!isAdministrator.value && tab.value === 'catalog') tab.value = 'stocks'
})

async function addStock() {
  if (!selectedApartment.value) return
  pending.value = true; error.value = ''
  try {
    const method = editingStockId.value ? 'PUT' : 'POST'
    const url = editingStockId.value ? `/api/inventory/${selectedApartment.value}/${replenish.consumableId}` : '/api/inventory/replenish'
    await $fetch(url, { method, body: { ...replenish, apartmentId: selectedApartment.value } })
    replenishOpen.value = false; editingStockId.value = null; await refresh()
  }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function addConsumable() {
  pending.value = true; error.value = ''
  try {
    const category = categoryPreset.value === 'custom' ? customCategory.value : categoryPreset.value
    await $fetch(editingConsumableId.value ? `/api/consumables/${editingConsumableId.value}` : '/api/consumables', { method: editingConsumableId.value ? 'PATCH' : 'POST', body: { ...catalog, category } })
    closeCatalog()
    await refreshConsumables()
  }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function openCreateCatalog() { error.value = ''; editingConsumableId.value = null; Object.assign(catalog, { name: '', unit: 'шт.' }); categoryPreset.value = 'Уборка'; customCategory.value = ''; catalogValidation.reset(); catalogOpen.value = true }
function openReplenish() {
  error.value = ''
  editingStockId.value = null
  Object.assign(replenish, { consumableId: '', quantity: 1, unitCostEur: 0, note: '', minimumQuantity: 0, targetQuantity: 0 })
  replenishOpen.value = true
}
function openEditStock(stock: Stock) {
  error.value = ''; editingStockId.value = stock.consumable.id
  Object.assign(replenish, { consumableId: stock.consumable.id, quantity: Number(stock.quantity), unitCostEur: Number(stock.unitCostEur), note: '', minimumQuantity: Number(stock.minimumQuantity), targetQuantity: Number(stock.targetQuantity) })
  replenishOpen.value = true
}
function openEditCatalog(item: Consumable) {
  error.value = ''; editingConsumableId.value = item.id; Object.assign(catalog, { name: item.name, unit: item.unit })
  const standardCategory = categoryItems.value.find(option => option.value === item.category)
  categoryPreset.value = standardCategory?.value ?? 'custom'; customCategory.value = standardCategory ? '' : item.category; catalogValidation.reset(); catalogOpen.value = true
}
function closeCatalog() { catalogOpen.value = false; editingConsumableId.value = null; Object.assign(catalog, { name: '', unit: 'шт.' }); categoryPreset.value = 'Уборка'; customCategory.value = '' }
function openDiscrepancy(item: InventoryDiscrepancy) {
  void navigateTo(`/cleanings/${encodeURIComponent(item.cleaning.id)}?from=inventory&focusConsumableId=${encodeURIComponent(item.consumable.id)}`)
}
function confirmDeleteConsumable(item: Consumable) { error.value = ''; consumableToDelete.value = item; deleteOpen.value = true }
async function deleteCatalogItem() {
  if (!consumableToDelete.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/consumables/${consumableToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; consumableToDelete.value = null; await Promise.all([refreshConsumables(), refresh()]) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function confirmDeleteStock() {
  if (!editingStockId.value) return
  error.value = ''
  stockDeleteOpen.value = true
}
async function deleteStock() {
  if (!selectedApartment.value || !editingStockId.value) return
  pending.value = true; error.value = ''
  try {
    await $fetch(`/api/inventory/${selectedApartment.value}/${editingStockId.value}`, { method: 'DELETE' })
    stockDeleteOpen.value = false; replenishOpen.value = false; editingStockId.value = null
    await refresh()
  }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function confirmApproveDiscrepancy(item: InventoryDiscrepancy) {
  discrepancyToApprove.value = item
  approvalError.value = ''
  approvalOpen.value = true
}
async function approveDiscrepancy() {
  if (!discrepancyToApprove.value) return
  approvalPending.value = true; approvalError.value = ''
  try {
    await $fetch(`/api/inventory/discrepancies/${discrepancyToApprove.value.id}/approve`, { method: 'POST' })
    approvalOpen.value = false; discrepancyToApprove.value = null
    await refreshDiscrepancies()
  }
  catch (cause: any) { approvalError.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { approvalPending.value = false }
}
</script>

<template>
  <section class="page-wrap inventory-page space-y-6">
    <PageHeader :title="t('inventory.title')">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" :icon="tab === 'stocks' ? 'i-lucide-package-plus' : 'i-lucide-plus'" @click="tab === 'stocks' ? openReplenish() : openCreateCatalog()">{{ tab === 'stocks' ? t('inventory.replenish') : t('inventory.addType') }}</UButton></template>
    </PageHeader>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UFieldGroup><UButton :variant="tab === 'stocks' ? 'solid' : 'soft'" @click="tab = 'stocks'">{{ t('inventory.byApartments') }}</UButton><UButton v-if="isAdministrator" :variant="tab === 'catalog' ? 'solid' : 'soft'" @click="tab = 'catalog'">{{ t('inventory.catalog') }}</UButton></UFieldGroup>
      <ApartmentSelect v-if="tab === 'stocks'" v-model="selectedApartment" :apartments="apartments ?? []" class="w-full sm:w-80" />
    </div>
    <template v-if="tab === 'stocks'">
      <section v-if="user?.roles.includes('administrator') && discrepancies?.length" class="surface inventory-discrepancies overflow-hidden bg-amber-50/50">
        <div class="inventory-discrepancies__header px-4 py-4 text-left"><h2 class="font-semibold text-amber-950">{{ t('inventory.discrepancies') }}</h2><p class="mt-1 text-sm text-amber-900/75">{{ t('inventory.discrepanciesDescription') }}</p></div>
        <div class="inventory-discrepancies__list text-left"><div v-for="item in discrepancies" :key="item.id" class="inventory-discrepancy-row flex min-h-14 w-full items-center text-left"><button type="button" class="inventory-discrepancy-row__link flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left" @click="openDiscrepancy(item)"><div class="min-w-0 flex-1 text-left"><p class="truncate font-medium">{{ item.consumable.name }} · {{ item.cleaning.apartment.name }}</p><p class="truncate text-sm text-amber-900/70">{{ item.cleaning.apartment.hotel.name }} · {{ t('inventory.remaining') }} {{ item.remainingQuantity }} {{ item.consumable.unit }}</p></div><StatusBadge :label="`${item.discrepancyQuantity > 0 ? '+' : ''}${item.discrepancyQuantity} ${item.consumable.unit}`" tone="warning" /><UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-amber-800/55" /></button><UButton type="button" color="neutral" variant="ghost" icon="i-lucide-circle-check" class="me-2 min-h-11 min-w-11 shrink-0" :aria-label="t('inventoryApproval.approveItem', { name: item.consumable.name })" @click="confirmApproveDiscrepancy(item)" /></div></div>
      </section>
      <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="stocks?.length" class="surface inventory-list divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="stock in stocks" :key="stock.id" class="inventory-stock-card flex min-h-16 items-center gap-3 py-2 sm:gap-4" :class="isAdministrator ? 'cursor-pointer' : ''" :role="isAdministrator ? 'button' : undefined" :tabindex="isAdministrator ? 0 : undefined" @click="isAdministrator && openEditStock(stock)" @keydown.enter="isAdministrator && openEditStock(stock)">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-package" class="size-4" /></div>
          <div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stock.consumable.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ t('inventory.threshold') }}: {{ stock.minimumQuantity }} · {{ t('inventory.target') }}: {{ stock.targetQuantity }} {{ stock.consumable.unit }}</p><p v-if="stock.autoWriteOffQuantity !== null" class="truncate text-xs text-[var(--color-muted)]">{{ t('inventory.auto') }}: {{ stock.autoWriteOffQuantity }} {{ stock.consumable.unit }} {{ t('common.afterCleaning') }}</p></div>
          <div class="text-right"><p class="text-base font-semibold tabular-nums">{{ stock.quantity }} {{ stock.consumable.unit }}</p><StatusBadge v-if="stock.isLow" :label="t('inventory.lowStock')" tone="danger" /></div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-package-open" :title="t('inventory.emptyStock')" :description="t('inventory.emptyStockDescription')"><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="openReplenish()">{{ t('inventory.replenish') }}</UButton></template></EmptyState>
    </template>
    <template v-else>
      <div v-if="consumables?.length" class="surface inventory-list divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="item in consumables" :key="item.id" class="inventory-catalog-card flex min-h-16 cursor-pointer items-center gap-3 py-2 sm:gap-4" role="button" tabindex="0" @click="openEditCatalog(item)" @keydown.enter="openEditCatalog(item)" @keydown.space.prevent="openEditCatalog(item)">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <UIcon name="i-lucide-spray-can" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ item.name }}</p>
            <p class="truncate text-sm text-[var(--color-muted)]">{{ item.category }}</p>
          </div>
          <p class="shrink-0 text-sm font-medium text-[var(--color-muted)]">{{ item.unit }}</p>
          <div v-if="user?.roles.includes('administrator')" class="flex shrink-0 items-center gap-1">
            <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" size="sm" :aria-label="`${t('common.edit')} ${item.name}`" @click.stop="openEditCatalog(item)" />
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" size="sm" :aria-label="`${t('work.delete')} ${item.name}`" @click.stop="confirmDeleteConsumable(item)" />
          </div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-list-plus" :title="t('inventory.emptyCatalog')" :description="t('inventory.emptyCatalogDescription')"><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="openCreateCatalog()">{{ t('inventory.addType') }}</UButton></template></EmptyState>
    </template>
    <USlideover v-model:open="replenishOpen" :title="editingStockId ? `${t('common.edit')}: ${consumables?.find(item => item.id === replenish.consumableId)?.name ?? ''}` : t('common.replenishStock')" :modal="true" :overlay="true"><template #body><form id="replenishment-form" class="form-grid inventory-form" @submit.prevent="addStock"><UFormField :label="t('inventory.consumable')"><USelect v-model="replenish.consumableId" :items="(consumables ?? []).map(item => ({ label: `${item.name} · ${item.category}`, value: item.id }))" class="w-full" :disabled="Boolean(editingStockId)" required /></UFormField><UFormField :label="t('inventory.quantity')"><UInput v-model.number="replenish.quantity" type="number" min="0" step=".001" required><template #trailing>{{ replenishmentUnit }}</template></UInput></UFormField><UFormField :label="t('inventory.unitPrice')"><MoneyInput v-model="replenish.unitCostEur" required /></UFormField><UFormField :label="t('common.thresholdStock')"><UInput v-model.number="replenish.minimumQuantity" type="number" min="0" step="1" required><template #trailing>{{ replenishmentUnit }}</template></UInput></UFormField><UFormField :label="t('common.targetStock')" :help="t('common.targetHelp')"><UInput v-model.number="replenish.targetQuantity" type="number" min="0" step="1" required><template #trailing>{{ replenishmentUnit }}</template></UInput></UFormField><p class="text-sm leading-5 text-[var(--color-muted)]">{{ t('inventoryHints.thresholdAndTargetHint') }}</p><UFormField :label="t('inventory.note')"><UInput v-model="replenish.note" placeholder="Например: закупка у поставщика" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></form></template><template #footer><div class="form-actions form-actions--footer"><UButton v-if="editingStockId" type="button" color="error" variant="soft" icon="i-lucide-trash-2" @click="confirmDeleteStock">{{ t('inventoryStockDelete.action') }}</UButton><div class="flex items-center gap-2"><UButton type="button" color="neutral" variant="ghost" @click="replenishOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="replenishment-form" :loading="pending">{{ editingStockId ? t('inventory.save') : t('inventory.replenish') }}</UButton></div></div></template></USlideover>
    <USlideover v-model:open="catalogOpen" :title="editingConsumableId ? t('common.edit') : t('common.newConsumableType')" :modal="true" :overlay="true">
      <template #body>
        <UForm :key="catalogValidation.formKey.value" id="consumable-form" :state="catalogValidationState" :validate="validateCatalog" :validate-on="catalogValidation.validateOn.value" novalidate class="form-grid inventory-form" @error="catalogValidation.onError" @submit="addConsumable">
          <UFormField name="name" :label="t('inventoryCatalog.name')"><UInput v-model="catalog.name" /></UFormField>
          <UFormField name="category" :label="t('inventoryCatalog.category')"><USelect v-model="categoryPreset" :items="categoryItems" class="w-full" /></UFormField>
          <UFormField v-if="categoryPreset === 'custom'" name="category" :label="t('inventoryCatalog.customCategory')"><UInput v-model="customCategory" /></UFormField>
          <UFormField name="unit" :label="t('inventory.unitPrice')"><UInput v-model="catalog.unit" :placeholder="t('inventory.unitPrice')" /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
        </UForm>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton type="button" color="neutral" variant="ghost" @click="closeCatalog">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" form="consumable-form" :loading="pending">{{ editingConsumableId ? t('inventory.save') : t('inventory.addType') }}</UButton>
        </div>
      </template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('common.deleteConsumable')" :description="t('common.irreversible')" :loading="pending" :error="error" @confirm="deleteCatalogItem" />
    <DeleteConfirmModal v-model:open="stockDeleteOpen" :title="t('inventoryStockDelete.title')" :description="t('inventoryStockDelete.description')" :loading="pending" :error="error" @confirm="deleteStock" />
    <ConfirmActionModal v-model:open="approvalOpen" :title="t('inventoryApproval.title')" :description="t('inventoryApproval.description', { name: discrepancyToApprove?.consumable.name ?? '', quantity: discrepancyToApprove?.remainingQuantity ?? '', unit: discrepancyToApprove?.consumable.unit ?? '' })" :confirm-label="t('inventoryApproval.confirm')" :loading="approvalPending" :error="approvalError" @confirm="approveDiscrepancy" />
  </section>
</template>
