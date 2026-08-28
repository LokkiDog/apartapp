<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { DeleteConfirmModal, EmptyState, MoneyInput, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { useI18n } from 'vue-i18n'

type Stock = { id: string; consumable: { id: string; name: string; unit: string; autoWriteOffEnabled: boolean; autoWriteOffQuantity: number }; quantity: number; minimumQuantity: number; targetQuantity: number; isLow: boolean }
type Consumable = { id: string; name: string; category: string; unit: string; autoWriteOffEnabled: boolean; autoWriteOffQuantity: number }
type InventoryDiscrepancy = { id: string; consumable: { name: string; unit: string }; cleaning: { apartment: { name: string; hotel: { name: string } } }; discrepancyQuantity: number; remainingQuantity: number; reportedAt: string }
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
const { data: discrepancies } = await useAsyncData('inventory-discrepancies', () => user.value?.roles.includes('administrator') ? $fetch<InventoryDiscrepancy[]>('/api/inventory/discrepancies') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const replenishOpen = ref(false), catalogOpen = ref(false), minimumOpen = ref(false), deleteOpen = ref(false)
const pending = ref(false), minimumPending = ref(false), error = ref('')
const replenish = reactive({ consumableId: '', quantity: 1, unitCostEur: 0 as number | null, note: '' })
const catalog = reactive({ name: '', category: '', unit: 'шт.', autoWriteOffEnabled: false, autoWriteOffQuantity: 0 })
const minimum = reactive({ consumableId: '', quantity: 0, targetQuantity: 0, name: '', unit: '' })
const editingConsumableId = ref<string | null>(null)
const consumableToDelete = ref<Consumable | null>(null)
const replenishmentUnit = computed(() => consumables.value?.find(item => item.id === replenish.consumableId)?.unit ?? '')

watchEffect(() => {
  if (!isAdministrator.value && tab.value === 'catalog') tab.value = 'stocks'
})

async function addStock() {
  if (!selectedApartment.value) return
  pending.value = true; error.value = ''
  try { await $fetch('/api/inventory/replenish', { method: 'POST', body: { ...replenish, apartmentId: selectedApartment.value } }); replenishOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function addConsumable() {
  pending.value = true; error.value = ''
  try {
    await $fetch(editingConsumableId.value ? `/api/consumables/${editingConsumableId.value}` : '/api/consumables', { method: editingConsumableId.value ? 'PATCH' : 'POST', body: catalog })
    closeCatalog()
    await refreshConsumables()
  }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function openCreateCatalog() { error.value = ''; editingConsumableId.value = null; Object.assign(catalog, { name: '', category: '', unit: 'шт.', autoWriteOffEnabled: false, autoWriteOffQuantity: 0 }); catalogOpen.value = true }
function openEditCatalog(item: Consumable) { error.value = ''; editingConsumableId.value = item.id; Object.assign(catalog, { name: item.name, category: item.category, unit: item.unit, autoWriteOffEnabled: item.autoWriteOffEnabled, autoWriteOffQuantity: Number(item.autoWriteOffQuantity) }); catalogOpen.value = true }
function closeCatalog() { catalogOpen.value = false; editingConsumableId.value = null; Object.assign(catalog, { name: '', category: '', unit: 'шт.', autoWriteOffEnabled: false, autoWriteOffQuantity: 0 }) }
function confirmDeleteConsumable(item: Consumable) { error.value = ''; consumableToDelete.value = item; deleteOpen.value = true }
async function deleteCatalogItem() {
  if (!consumableToDelete.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/consumables/${consumableToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; consumableToDelete.value = null; await Promise.all([refreshConsumables(), refresh()]) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function openMinimum(stock: Stock) {
  error.value = ''
  Object.assign(minimum, { consumableId: stock.consumable.id, quantity: Number(stock.minimumQuantity), targetQuantity: Number(stock.targetQuantity), name: stock.consumable.name, unit: stock.consumable.unit })
  minimumOpen.value = true
}
async function saveMinimum() {
  if (!selectedApartment.value || !minimum.consumableId) return
  minimumPending.value = true; error.value = ''
  try { await $fetch(`/api/apartments/${selectedApartment.value}/consumables`, { method: 'POST', body: { consumableId: minimum.consumableId, minimumQuantity: minimum.quantity, targetQuantity: minimum.targetQuantity } }); minimumOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { minimumPending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('inventory.title')">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" :icon="tab === 'stocks' ? 'i-lucide-package-plus' : 'i-lucide-plus'" @click="tab === 'stocks' ? replenishOpen = true : openCreateCatalog()">{{ tab === 'stocks' ? t('inventory.replenish') : t('inventory.addType') }}</UButton></template>
    </PageHeader>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UFieldGroup><UButton :variant="tab === 'stocks' ? 'solid' : 'soft'" @click="tab = 'stocks'">{{ t('inventory.byApartments') }}</UButton><UButton v-if="isAdministrator" :variant="tab === 'catalog' ? 'solid' : 'soft'" @click="tab = 'catalog'">{{ t('inventory.catalog') }}</UButton></UFieldGroup>
      <USelect v-if="tab === 'stocks'" v-model="selectedApartment" :items="(apartments ?? []).map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))" class="w-full sm:w-80" />
    </div>
    <template v-if="tab === 'stocks'">
      <section v-if="user?.roles.includes('administrator') && discrepancies?.length" class="surface overflow-hidden border-amber-200 bg-amber-50/50">
        <div class="flex items-start gap-3 border-b border-amber-200 px-5 py-4 sm:px-6"><UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 text-amber-700" /><div><h2 class="font-semibold text-amber-950">{{ t('inventory.discrepancies') }}</h2><p class="mt-1 text-sm text-amber-900/75">{{ t('inventory.discrepanciesDescription') }}</p></div></div>
        <div class="divide-y divide-amber-200/70 px-5 sm:px-6"><div v-for="item in discrepancies" :key="item.id" class="flex items-center gap-3 py-3"><div class="min-w-0 flex-1"><p class="truncate font-medium">{{ item.consumable.name }} · {{ item.cleaning.apartment.name }}</p><p class="truncate text-sm text-amber-900/70">{{ item.cleaning.apartment.hotel.name }} · {{ t('inventory.remaining') }} {{ item.remainingQuantity }} {{ item.consumable.unit }}</p></div><StatusBadge :label="`${item.discrepancyQuantity > 0 ? '+' : ''}${item.discrepancyQuantity} ${item.consumable.unit}`" tone="warning" /></div></div>
      </section>
      <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="stocks?.length" class="surface divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="stock in stocks" :key="stock.id" class="flex min-h-16 items-center gap-3 py-2 sm:gap-4">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-package" class="size-4" /></div>
          <div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stock.consumable.name }}</p><UButton v-if="user?.roles.includes('administrator')" color="neutral" variant="link" size="xs" class="-ml-2" @click="openMinimum(stock)">{{ t('inventory.threshold') }}: {{ stock.minimumQuantity }} · {{ t('inventory.target') }}: {{ stock.targetQuantity }} {{ stock.consumable.unit }}</UButton><p v-else class="truncate text-sm text-[var(--color-muted)]">{{ t('inventory.threshold') }}: {{ stock.minimumQuantity }} · {{ t('inventory.target') }}: {{ stock.targetQuantity }} {{ stock.consumable.unit }}</p><p v-if="stock.consumable.autoWriteOffEnabled" class="truncate text-xs text-[var(--color-muted)]">{{ t('inventory.auto') }}: {{ stock.consumable.autoWriteOffQuantity }} {{ stock.consumable.unit }} {{ t('common.afterCleaning') }}</p></div>
          <div class="text-right"><p class="text-base font-semibold tabular-nums">{{ stock.quantity }} {{ stock.consumable.unit }}</p><StatusBadge v-if="stock.isLow" :label="t('inventory.lowStock')" tone="danger" /></div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-package-open" :title="t('inventory.emptyStock')" :description="t('inventory.emptyStockDescription')"><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="replenishOpen = true">{{ t('inventory.replenish') }}</UButton></template></EmptyState>
    </template>
    <template v-else>
      <div v-if="consumables?.length" class="surface divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="item in consumables" :key="item.id" class="flex min-h-16 items-center gap-3 py-2 sm:gap-4">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <UIcon name="i-lucide-spray-can" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ item.name }}</p>
            <p class="truncate text-sm text-[var(--color-muted)]">{{ item.category }}<span v-if="item.autoWriteOffEnabled"> · {{ t('inventory.auto') }}: {{ item.autoWriteOffQuantity }} {{ item.unit }} {{ t('common.afterCleaning') }}</span></p>
          </div>
          <p class="shrink-0 text-sm font-medium text-[var(--color-muted)]">{{ item.unit }}</p>
          <div v-if="user?.roles.includes('administrator')" class="flex shrink-0 items-center gap-1">
            <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" size="sm" :aria-label="`${t('work.editCleaning')} ${item.name}`" @click="openEditCatalog(item)" />
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" size="sm" :aria-label="`${t('work.delete')} ${item.name}`" @click="confirmDeleteConsumable(item)" />
          </div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-list-plus" :title="t('inventory.emptyCatalog')" :description="t('inventory.emptyCatalogDescription')"><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="openCreateCatalog()">{{ t('inventory.addType') }}</UButton></template></EmptyState>
    </template>
    <USlideover v-model:open="replenishOpen" :title="t('common.replenishStock')"><template #body><form id="replenishment-form" class="form-grid" @submit.prevent="addStock"><UFormField :label="t('inventory.consumable')"><USelect v-model="replenish.consumableId" :items="(consumables ?? []).map(item => ({ label: `${item.name} · ${item.category}`, value: item.id }))" class="w-full" required /></UFormField><UFormField :label="t('inventory.quantity')"><UInput v-model.number="replenish.quantity" type="number" min=".001" step=".001" required><template #trailing>{{ replenishmentUnit }}</template></UInput></UFormField><UFormField :label="t('inventory.unitPrice')"><MoneyInput v-model="replenish.unitCostEur" required /></UFormField><UFormField :label="t('inventory.note')"><UInput v-model="replenish.note" :placeholder="t('common.examplePurchase')" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></form></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="replenishOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="replenishment-form" :loading="pending">{{ t('inventory.replenish') }}</UButton></div></template></USlideover>
    <USlideover v-model:open="minimumOpen" :title="`${t('common.targetStock')}: ${minimum.name}`"><template #body><form id="minimum-stock-form" class="form-grid" @submit.prevent="saveMinimum"><p class="text-sm text-[var(--color-muted)]">{{ t('common.thresholdHint') }}</p><UFormField :label="t('common.thresholdStock')"><UInput v-model.number="minimum.quantity" type="number" min="0" step="1" required><template #trailing>{{ minimum.unit }}</template></UInput></UFormField><UFormField :label="t('common.targetStock')" :help="t('common.targetHelp')"><UInput v-model.number="minimum.targetQuantity" type="number" min="0" step="1" required><template #trailing>{{ minimum.unit }}</template></UInput></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></form></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="minimumOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="minimum-stock-form" :loading="minimumPending">{{ t('inventory.save') }}</UButton></div></template></USlideover>
    <USlideover v-model:open="catalogOpen" :title="editingConsumableId ? t('common.edit') : t('common.newConsumableType')">
      <template #body>
        <form id="consumable-form" class="form-grid" @submit.prevent="addConsumable">
          <UFormField :label="t('users.name')"><UInput v-model="catalog.name" required /></UFormField>
          <UFormField :label="t('reports.byCategories')"><UInput v-model="catalog.category" required /></UFormField>
          <UFormField :label="t('inventory.unitPrice')"><UInput v-model="catalog.unit" :placeholder="t('inventory.unitPrice')" required /></UFormField>
          <UCheckbox v-model="catalog.autoWriteOffEnabled" :label="t('common.autoWriteOff')" class="min-h-11 items-center font-medium" />
          <UFormField v-if="catalog.autoWriteOffEnabled" :label="t('common.quantityPerCleaning')">
            <UInput v-model.number="catalog.autoWriteOffQuantity" type="number" min=".001" step=".001" required><template #trailing>{{ catalog.unit || 'ед.' }}</template></UInput>
          </UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
        </form>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton type="button" color="neutral" variant="ghost" @click="closeCatalog">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" form="consumable-form" :loading="pending">{{ editingConsumableId ? t('inventory.save') : t('inventory.addType') }}</UButton>
        </div>
      </template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('common.deleteConsumable')" :description="t('common.irreversible')" :loading="pending" :error="error" @confirm="deleteCatalogItem" />
  </section>
</template>
