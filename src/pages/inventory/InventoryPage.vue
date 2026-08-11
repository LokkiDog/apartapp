<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { DeleteConfirmModal, EmptyState, MoneyInput, PageHeader, StatusBadge } from '#fsd/shared/ui'

type Stock = { id: string; consumable: { id: string; name: string; unit: string }; quantity: number; minimumQuantity: number; targetQuantity: number; isLow: boolean }
type Consumable = { id: string; name: string; category: string; unit: string }
const user = useCurrentUser()
const tab = ref<'stocks' | 'catalog'>('stocks')
const selectedApartment = ref('')
const { data: apartments } = await useAsyncData('inventory-apartments', () => $fetch<Apartment[]>('/api/apartments'), { server: false })
watchEffect(() => { if (!selectedApartment.value && apartments.value?.[0]) selectedApartment.value = apartments.value[0].id })
const { data: stocks, refresh, status } = await useAsyncData('inventory-stocks', () => selectedApartment.value ? $fetch<Stock[]>(`/api/inventory/${selectedApartment.value}`) : Promise.resolve([]), { server: false, watch: [selectedApartment] })
const { data: consumables, refresh: refreshConsumables } = await useAsyncData('inventory-consumables', () => $fetch<Consumable[]>('/api/consumables'), { server: false })
const replenishOpen = ref(false), catalogOpen = ref(false), minimumOpen = ref(false), deleteOpen = ref(false)
const pending = ref(false), minimumPending = ref(false), error = ref('')
const replenish = reactive({ consumableId: '', quantity: 1, unitCostEur: 0 as number | null, note: '' })
const catalog = reactive({ name: '', category: '', unit: 'шт.' })
const minimum = reactive({ consumableId: '', quantity: 0, targetQuantity: 0, name: '', unit: '' })
const editingConsumableId = ref<string | null>(null)
const consumableToDelete = ref<Consumable | null>(null)
const replenishmentUnit = computed(() => consumables.value?.find(item => item.id === replenish.consumableId)?.unit ?? '')

async function addStock() {
  if (!selectedApartment.value) return
  pending.value = true; error.value = ''
  try { await $fetch('/api/inventory/replenish', { method: 'POST', body: { ...replenish, apartmentId: selectedApartment.value } }); replenishOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось пополнить остаток' }
  finally { pending.value = false }
}
async function addConsumable() {
  pending.value = true; error.value = ''
  try {
    await $fetch(editingConsumableId.value ? `/api/consumables/${editingConsumableId.value}` : '/api/consumables', { method: editingConsumableId.value ? 'PATCH' : 'POST', body: catalog })
    closeCatalog()
    await refreshConsumables()
  }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить расходник' }
  finally { pending.value = false }
}
function openCreateCatalog() { error.value = ''; editingConsumableId.value = null; Object.assign(catalog, { name: '', category: '', unit: 'шт.' }); catalogOpen.value = true }
function openEditCatalog(item: Consumable) { error.value = ''; editingConsumableId.value = item.id; Object.assign(catalog, { name: item.name, category: item.category, unit: item.unit }); catalogOpen.value = true }
function closeCatalog() { catalogOpen.value = false; editingConsumableId.value = null; Object.assign(catalog, { name: '', category: '', unit: 'шт.' }) }
function confirmDeleteConsumable(item: Consumable) { error.value = ''; consumableToDelete.value = item; deleteOpen.value = true }
async function deleteCatalogItem() {
  if (!consumableToDelete.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/consumables/${consumableToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; consumableToDelete.value = null; await Promise.all([refreshConsumables(), refresh()]) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось удалить расходник' }
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
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить минимум' }
  finally { minimumPending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Остатки" description="Расходники отдельно по каждому апартаменту.">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" :icon="tab === 'stocks' ? 'i-lucide-package-plus' : 'i-lucide-plus'" @click="tab === 'stocks' ? replenishOpen = true : openCreateCatalog()">{{ tab === 'stocks' ? 'Пополнить' : 'Добавить тип' }}</UButton></template>
    </PageHeader>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UFieldGroup><UButton :variant="tab === 'stocks' ? 'solid' : 'soft'" @click="tab = 'stocks'">По апартаментам</UButton><UButton :variant="tab === 'catalog' ? 'solid' : 'soft'" @click="tab = 'catalog'">Каталог</UButton></UFieldGroup>
      <USelect v-if="tab === 'stocks'" v-model="selectedApartment" :items="(apartments ?? []).map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))" class="w-full sm:w-80" />
    </div>
    <template v-if="tab === 'stocks'">
      <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-20 rounded-2xl" /></div>
      <div v-else-if="stocks?.length" class="surface divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="stock in stocks" :key="stock.id" class="flex min-h-16 items-center gap-3 py-2 sm:gap-4">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-package" class="size-4" /></div>
          <div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ stock.consumable.name }}</p><UButton v-if="user?.roles.includes('administrator')" color="neutral" variant="link" size="xs" class="-ml-2" @click="openMinimum(stock)">Порог: {{ stock.minimumQuantity }} · Цель: {{ stock.targetQuantity }} {{ stock.consumable.unit }}</UButton><p v-else class="truncate text-sm text-[var(--color-muted)]">Порог: {{ stock.minimumQuantity }} · Цель: {{ stock.targetQuantity }} {{ stock.consumable.unit }}</p></div>
          <div class="text-right"><p class="text-base font-semibold tabular-nums">{{ stock.quantity }} {{ stock.consumable.unit }}</p><StatusBadge v-if="stock.isLow" label="Низкий остаток" tone="danger" /></div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-package-open" title="Остатки ещё не настроены" description="Пополните первый расходник для выбранного апартамента."><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="replenishOpen = true">Пополнить</UButton></template></EmptyState>
    </template>
    <template v-else>
      <div v-if="consumables?.length" class="surface divide-y divide-[var(--color-line)] px-4 sm:px-6">
        <div v-for="item in consumables" :key="item.id" class="flex min-h-16 items-center gap-3 py-2 sm:gap-4">
          <div class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <UIcon name="i-lucide-spray-can" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ item.name }}</p>
            <p class="truncate text-sm text-[var(--color-muted)]">{{ item.category }}</p>
          </div>
          <p class="shrink-0 text-sm font-medium text-[var(--color-muted)]">{{ item.unit }}</p>
          <div v-if="user?.roles.includes('administrator')" class="flex shrink-0 items-center gap-1">
            <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" size="sm" :aria-label="`Изменить ${item.name}`" @click="openEditCatalog(item)" />
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" size="sm" :aria-label="`Удалить ${item.name}`" @click="confirmDeleteConsumable(item)" />
          </div>
        </div>
      </div>
      <EmptyState v-else icon="i-lucide-list-plus" title="Каталог пуст" description="Добавьте типы расходников, которые используются в апартаментах."><template #actions><UButton v-if="user?.roles.includes('administrator')" @click="openCreateCatalog()">Добавить тип</UButton></template></EmptyState>
    </template>
    <USlideover v-model:open="replenishOpen" title="Пополнить остаток"><template #body><form class="form-grid" @submit.prevent="addStock"><UFormField label="Расходник"><USelect v-model="replenish.consumableId" :items="(consumables ?? []).map(item => ({ label: `${item.name} · ${item.category}`, value: item.id }))" class="w-full" required /></UFormField><UFormField label="Количество"><UInput v-model.number="replenish.quantity" type="number" min=".001" step=".001" required><template #trailing>{{ replenishmentUnit }}</template></UInput></UFormField><UFormField label="Цена единицы"><MoneyInput v-model="replenish.unitCostEur" required /></UFormField><UFormField label="Комментарий"><UInput v-model="replenish.note" placeholder="Например, закупка 12 августа" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="replenishOpen = false">Отмена</UButton><UButton type="submit" :loading="pending">Пополнить</UButton></div></form></template></USlideover>
    <USlideover v-model:open="minimumOpen" :title="`Запас: ${minimum.name}`"><template #body><form class="form-grid" @submit.prevent="saveMinimum"><p class="text-sm text-[var(--color-muted)]">Когда остаток достигнет порога, отчёт предложит докупить расходник до целевого значения.</p><UFormField label="Порог пополнения"><UInput v-model.number="minimum.quantity" type="number" min="0" step="1" required><template #trailing>{{ minimum.unit }}</template></UInput></UFormField><UFormField label="Целевой остаток" help="Для положительного порога цель должна быть больше него."><UInput v-model.number="minimum.targetQuantity" type="number" min="0" step="1" required><template #trailing>{{ minimum.unit }}</template></UInput></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="minimumOpen = false">Отмена</UButton><UButton type="submit" :loading="minimumPending">Сохранить</UButton></div></form></template></USlideover>
    <USlideover v-model:open="catalogOpen" :title="editingConsumableId ? 'Изменить расходник' : 'Новый тип расходника'">
      <template #body>
        <form class="form-grid" @submit.prevent="addConsumable">
          <UFormField label="Название"><UInput v-model="catalog.name" placeholder="Туалетная бумага" required /></UFormField>
          <UFormField label="Категория"><UInput v-model="catalog.category" placeholder="Ванная" required /></UFormField>
          <UFormField label="Единица измерения"><UInput v-model="catalog.unit" placeholder="шт., л, упаковка" required /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
          <div class="form-actions">
            <UButton color="neutral" variant="ghost" @click="closeCatalog">Отмена</UButton>
            <UButton type="submit" :loading="pending">{{ editingConsumableId ? 'Сохранить' : 'Создать тип' }}</UButton>
          </div>
        </form>
      </template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" title="Удалить тип расходника?" :description="`«${consumableToDelete?.name ?? ''}» будет удалён из каталога, всех апартаментов, партий, движений и связанных финансовых строк.`" :loading="pending" :error="error" @confirm="deleteCatalogItem" />
  </section>
</template>
