<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatDate, formatEuro } from '#fsd/shared/lib'

type Category = 'cleaning' | 'inventory' | 'task'
type Line = { id: string, category: Category, description: string, occurredOn: string | null, amountEur: number, position: number }
const props = withDefaults(defineProps<{ lines: Line[], totalEur: number, editable?: boolean, editingLineId?: string | null, embedded?: boolean, inventoryExpanded?: boolean }>(), { editable: false, editingLineId: null, embedded: false, inventoryExpanded: false })
const emit = defineEmits<{
  select: [id: string]
  toggleInventory: []
  close: []
  update: [id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>]
  remove: [id: string]
}>()
const labels: Record<Category, string> = { cleaning: 'Уборки', inventory: 'Расходники', task: 'Дополнительные работы' }
const categories: Category[] = ['cleaning', 'inventory', 'task']
function categoryLines(category: Category) { return props.lines.filter(line => line.category === category) }
function categoryTotal(category: Category) { return Number(categoryLines(category).reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2)) }
function showCategoryLines(category: Category) { return category !== 'inventory' || (props.editable && props.inventoryExpanded) }
</script>

<template>
  <div :class="embedded ? 'divide-y divide-[var(--color-line)]' : 'space-y-4'">
    <section v-for="category in categories" :key="category" :class="embedded ? 'overflow-hidden' : 'surface overflow-hidden'">
      <button
        v-if="category === 'inventory' && editable"
        type="button"
        class="manager-expense-category-header manager-expense-inventory-header grid min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-[background-color,scale] duration-150 hover:bg-[var(--color-surface-muted)] active:scale-[0.96] sm:px-6"
        :class="{ 'border-b border-[var(--color-line)]': inventoryExpanded && categoryLines(category).length }"
        :aria-expanded="inventoryExpanded"
        @click="emit('toggleInventory')"
      >
        <h2 class="font-semibold">{{ labels[category] }}</h2>
        <strong class="tabular-nums">{{ formatEuro(categoryTotal(category)) }}</strong>
        <UIcon name="i-lucide-chevron-down" class="size-4 text-[var(--color-muted)] transition-transform duration-150" :class="{ 'rotate-180': inventoryExpanded }" />
      </button>
      <div
        v-else
        class="manager-expense-category-header flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-left sm:px-6"
        :class="{ 'border-b border-[var(--color-line)]': showCategoryLines(category) && categoryLines(category).length }"
      >
        <h2 class="font-semibold">{{ labels[category] }}</h2>
        <strong class="tabular-nums">{{ formatEuro(categoryTotal(category)) }}</strong>
      </div>
      <div v-if="showCategoryLines(category) && categoryLines(category).length" class="manager-expense-lines">
        <template v-for="line in categoryLines(category)" :key="line.id">
          <form v-if="editable && editingLineId === line.id" class="manager-expense-editor grid gap-2 py-3" @submit.prevent="emit('close')">
            <UInput :model-value="line.description" placeholder="Название" autofocus @update:model-value="value => emit('update', line.id, { description: value })" />
            <UInput :model-value="line.occurredOn ?? ''" type="date" @update:model-value="value => emit('update', line.id, { occurredOn: value || null })" />
            <UInput :model-value="line.amountEur" type="number" step="0.01" @update:model-value="value => emit('update', line.id, { amountEur: Number(value) || 0 })" />
            <div class="flex gap-1"><UButton type="submit" color="neutral" variant="ghost" icon="i-lucide-check" aria-label="Готово" class="min-h-11 min-w-11" /><UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить строку" class="min-h-11 min-w-11" @click="emit('remove', line.id)" /></div>
          </form>
          <button v-else type="button" class="manager-expense-row grid min-h-14 w-full items-center gap-3 py-3 text-left transition-[background-color,scale] duration-150 hover:bg-[var(--color-surface-muted)] active:scale-[0.96] sm:gap-4" :class="{ 'cursor-default': !editable }" :disabled="!editable" @click="emit('select', line.id)"><span class="min-w-0 justify-self-start truncate text-left font-medium">{{ line.description }}</span><span class="whitespace-nowrap text-xs text-[var(--color-muted)] sm:text-sm">{{ line.occurredOn ? formatDate(line.occurredOn) : '' }}</span><strong class="shrink-0 whitespace-nowrap text-right tabular-nums">{{ formatEuro(line.amountEur) }}</strong></button>
        </template>
      </div>
    </section>
    <section :class="embedded ? 'flex items-center justify-between gap-4 px-5 py-5 sm:px-6' : 'surface flex items-center justify-between gap-4 p-5 sm:p-6'"><span class="text-sm text-[var(--color-muted)]">Итого за месяц</span><strong class="text-2xl tracking-[-0.03em] tabular-nums">{{ formatEuro(totalEur) }}</strong></section>
  </div>
</template>

<style scoped>
.manager-expense-inventory-header {
  grid-template-columns: minmax(0, 1fr) auto auto;
  justify-items: stretch;
}

.manager-expense-category-header,
.manager-expense-category-header h2 {
  text-align: left;
}

.manager-expense-row {
  grid-template-columns: minmax(0, 1fr) 6.75rem auto;
  justify-items: stretch;
  text-align: left;
}

.manager-expense-row > :first-child {
  justify-self: start;
  text-align: left;
}

.manager-expense-lines > :not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--color-line) 32%, transparent);
}

.manager-expense-lines {
  padding-inline: 2.5rem 1.25rem;
}

.manager-expense-lines .manager-expense-row {
  color: var(--color-muted);
}

@media (min-width: 640px) {
  .manager-expense-lines {
    padding-inline: 3rem 1.5rem;
  }

  .manager-expense-row {
    grid-template-columns: minmax(0, 1fr) 9rem auto;
  }

  .manager-expense-editor {
    grid-template-columns: minmax(0, 1fr) 10rem 9rem auto;
  }
}
</style>
