<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatEuro } from '#fsd/shared/lib'
import { EmptyState, PageHeader } from '#fsd/shared/ui'

type StatementEntry = { id: string; apartmentId: string; apartmentName: string; description: string; occurredOn: string; amountEur: number; type: string; sourceType: string; sourceId: string }
const month = ref(new Date().toISOString().slice(0, 7))
const { data, refresh: refreshData, status } = await useAsyncData('statement', () => $fetch<{ entries: StatementEntry[]; totalEur: number }>('/api/finance/statement', { query: { month: month.value } }), { watch: [month] })
const typeLabels: Record<string, string> = { cleaning_charge: 'Уборки', inventory_charge: 'Расходники', task_charge: 'Работы', guest_service_charge: 'Дополнительные услуги', compensation: 'Корректировки' }
const groups = computed(() => {
  const result = new Map<string, Map<string, StatementEntry[]>>()
  for (const entry of data.value?.entries ?? []) {
    const apartment = result.get(entry.apartmentName) ?? new Map<string, StatementEntry[]>()
    apartment.set(entry.type, [...(apartment.get(entry.type) ?? []), entry])
    result.set(entry.apartmentName, apartment)
  }
  return [...result.entries()].map(([apartmentName, categories]) => ({
    apartmentName,
    categories: [...categories.entries()].map(([type, entries]) => ({
      type,
      entries,
      totalEur: Number(entries.reduce((sum, entry) => sum.plus(entry.amountEur), new Decimal(0)).toDecimalPlaces(2))
    }))
  }))
})
function sourceHref(entry: StatementEntry) { if (entry.sourceType === 'cleaning' || entry.sourceType === 'task') return '/work'; if (entry.sourceType === 'inventory_movement') return '/inventory'; return '/calendar' }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Мои расходы" description="Ваши расходы с разбивкой по апартаментам.">
      <template #actions><UInput v-model="month" type="month" class="w-44" /></template>
    </PageHeader>
    <div class="surface flex flex-col gap-2 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div><p class="text-sm text-[var(--color-muted)]">Итого за выбранный месяц</p><p class="mt-2 text-3xl font-semibold tracking-[-0.045em] tabular-nums">{{ formatEuro(data?.totalEur ?? 0) }}</p></div>
      <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="refreshData()">Обновить</UButton>
    </div>
    <div v-if="status === 'pending'" class="grid gap-4"><USkeleton v-for="item in 3" :key="item" class="h-40 rounded-2xl" /></div>
    <div v-else-if="groups.length" class="space-y-5">
      <section v-for="group in groups" :key="group.apartmentName" class="surface overflow-hidden">
        <div class="border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><h2 class="font-semibold">{{ group.apartmentName }}</h2></div>
        <div v-for="category in group.categories" :key="category.type" class="px-5 py-4 sm:px-6">
          <div class="flex items-center justify-between gap-3"><h3 class="text-sm font-semibold">{{ typeLabels[category.type] ?? category.type }}</h3><span class="font-semibold tabular-nums">{{ formatEuro(category.totalEur) }}</span></div>
          <div class="mt-2 divide-y divide-[var(--color-line)]"><NuxtLink v-for="entry in category.entries" :key="entry.id" :to="sourceHref(entry)" class="flex min-h-16 items-center justify-between gap-4 rounded-lg py-3 transition-[background-color,scale] duration-150 hover:bg-[#f5f8f6] active:scale-[0.99]"><div class="min-w-0"><p class="truncate font-medium">{{ entry.description }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ new Intl.DateTimeFormat('ru-RU').format(new Date(`${entry.occurredOn}T00:00:00`)) }}</p></div><span class="shrink-0 font-semibold tabular-nums">{{ formatEuro(entry.amountEur) }}</span></NuxtLink></div>
        </div>
      </section>
    </div>
    <EmptyState v-else icon="i-lucide-receipt-euro" title="Операций в этом месяце нет" description="Уборки, задачи и списания появятся здесь автоматически." />
  </section>
</template>
