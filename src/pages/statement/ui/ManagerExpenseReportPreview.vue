<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { createManagerExpenseCategoryVisibility, visibleManagerExpenseCategories, type ManagerExpenseCategory as Category, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine as Line } from '../model/manager-expense-report'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{ lines: Line[], totalEur: number, categoryVisibility?: ManagerExpenseCategoryVisibility, editable?: boolean, editingLineId?: string | null, embedded?: boolean, inventoryExpanded?: boolean }>(), { categoryVisibility: createManagerExpenseCategoryVisibility, editable: false, editingLineId: null, embedded: false, inventoryExpanded: false })
const emit = defineEmits<{
  select: [id: string]
  toggleInventory: []
  updateCategoryVisibility: [category: Category, enabled: boolean]
  close: []
  update: [id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>]
  remove: [id: string]
}>()
const { t } = useI18n()
const labels = computed<Record<Category, string>>(() => ({ cleaning: t('work.cleanings'), inventory: t('reports.procurement'), task: t('work.tasks'), other: t('reports.finance') }))
const categories = computed(() => visibleManagerExpenseCategories(props.categoryVisibility, props.editable))
const managerPresentation = computed(() => !props.editable && !props.embedded)
function categoryLines(category: Category) { return props.lines.filter(line => line.category === category) }
function categoryTotal(category: Category) { return Number(categoryLines(category).reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2)) }
function showCategoryLines(category: Category) { return category !== 'inventory' || (props.editable && props.inventoryExpanded) }
</script>

<template>
  <div :class="[embedded ? 'divide-y divide-[var(--color-line)]' : 'space-y-4', { 'manager-expense-preview--manager': managerPresentation }]">
    <div :class="managerPresentation ? 'manager-expense-categories surface divide-y divide-[var(--color-line)] overflow-hidden' : 'contents'">
      <section v-for="category in categories" :key="category" :class="embedded || managerPresentation ? 'overflow-hidden' : 'surface overflow-hidden'">
        <div
          class="manager-expense-category-header flex min-h-14 items-center gap-1 px-5 text-left sm:px-6"
          :class="{ 'border-b border-[var(--color-line)]': showCategoryLines(category) && categoryLines(category).length }"
        >
          <UCheckbox
            v-if="editable"
            :model-value="categoryVisibility[category]"
            :aria-label="`${categoryVisibility[category] ? t('common.hide') : t('common.show')} ${labels[category]}`"
            class="min-h-11 min-w-11 shrink-0 items-center justify-center"
            @click.stop
            @update:model-value="value => emit('updateCategoryVisibility', category, value === true)"
          />
          <button
            v-if="category === 'inventory' && editable"
            type="button"
            class="manager-expense-inventory-toggle grid min-h-14 min-w-0 flex-1 items-center gap-3 text-left transition-[background-color,scale] duration-150 hover:bg-[var(--color-surface-muted)] active:scale-[0.96]"
            :aria-expanded="inventoryExpanded"
            @click="emit('toggleInventory')"
          >
            <h2 class="font-semibold">{{ labels[category] }}</h2>
            <strong class="tabular-nums">{{ formatEuro(categoryTotal(category)) }}</strong>
            <UIcon name="i-lucide-chevron-down" class="size-4 text-[var(--color-muted)] transition-transform duration-150" :class="{ 'rotate-180': inventoryExpanded }" />
          </button>
          <template v-else>
            <h2 class="min-w-0 flex-1 font-semibold">{{ labels[category] }}</h2>
            <strong class="tabular-nums">{{ formatEuro(categoryTotal(category)) }}</strong>
          </template>
        </div>
        <div v-if="showCategoryLines(category) && categoryLines(category).length" class="manager-expense-lines">
          <template v-for="line in categoryLines(category)" :key="line.id">
            <form v-if="editable && editingLineId === line.id" class="manager-expense-editor grid gap-2 py-3" @submit.prevent="emit('close')">
              <UInput :model-value="line.description" :placeholder="t('hotels.name')" autofocus @update:model-value="value => emit('update', line.id, { description: value })" />
              <UInput :model-value="line.occurredOn ?? ''" type="date" @update:model-value="value => emit('update', line.id, { occurredOn: value || null })" />
              <UInput :model-value="line.amountEur" type="number" step="0.01" @update:model-value="value => emit('update', line.id, { amountEur: Number(value) || 0 })" />
              <div class="flex gap-1"><UButton type="submit" color="neutral" variant="ghost" icon="i-lucide-check" :aria-label="t('common.save')" class="min-h-11 min-w-11" /><UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('common.delete')" class="min-h-11 min-w-11" @click="emit('remove', line.id)" /></div>
            </form>
            <button v-else type="button" class="manager-expense-row grid min-h-14 w-full items-center gap-3 py-3 text-left transition-[background-color,scale] duration-150 hover:bg-[var(--color-surface-muted)] active:scale-[0.96] sm:gap-4" :class="{ 'cursor-default': !editable }" :disabled="!editable" @click="emit('select', line.id)"><span class="min-w-0 justify-self-start truncate text-left font-medium">{{ line.description }}</span><span class="whitespace-nowrap text-xs text-[var(--color-muted)] sm:text-sm">{{ line.occurredOn ? formatDate(line.occurredOn) : '' }}</span><strong class="shrink-0 whitespace-nowrap text-right tabular-nums">{{ formatEuro(line.amountEur) }}</strong></button>
          </template>
        </div>
      </section>
      <section v-if="managerPresentation" class="manager-expense-total flex items-center justify-between gap-4 px-5 sm:px-6"><span class="text-sm text-[var(--color-muted)]">{{ t('reports.currentTotal') }}</span><strong class="text-2xl tracking-[-0.03em] tabular-nums">{{ formatEuro(totalEur) }}</strong></section>
    </div>
    <section v-if="!managerPresentation" :class="embedded ? 'flex items-center justify-between gap-4 px-5 py-5 sm:px-6' : 'manager-expense-total surface flex items-center justify-between gap-4 p-5 sm:p-6'"><span class="text-sm text-[var(--color-muted)]">{{ t('reports.currentTotal') }}</span><strong class="text-2xl tracking-[-0.03em] tabular-nums">{{ formatEuro(totalEur) }}</strong></section>
  </div>
</template>

<style scoped>
.manager-expense-inventory-toggle {
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

.manager-expense-preview--manager .manager-expense-category-header {
  min-height: 3.75rem;
  gap: .75rem;
  padding-block: .875rem;
  background: color-mix(in srgb, var(--color-surface-muted) 68%, white);
}

.manager-expense-preview--manager .manager-expense-category-header h2 {
  font-size: .9375rem;
  line-height: 1.35;
  letter-spacing: .005em;
  text-wrap: balance;
}

.manager-expense-preview--manager .manager-expense-category-header strong,
.manager-expense-preview--manager .manager-expense-row strong {
  justify-self: end;
  text-align: right;
}

.manager-expense-preview--manager .manager-expense-lines {
  padding-inline: 2rem 1.25rem;
}

.manager-expense-preview--manager .manager-expense-row {
  grid-template-columns: minmax(4.5rem, 1fr) minmax(6rem, 7rem) max-content;
  gap: .5rem;
  padding-block: .875rem;
}

.manager-expense-preview--manager .manager-expense-row > :first-child {
  overflow: visible;
  line-height: 1.35;
  text-overflow: clip;
  text-wrap: pretty;
  white-space: normal;
}

.manager-expense-preview--manager .manager-expense-total {
  min-height: 4.75rem;
  padding-block: 1.125rem;
  background: color-mix(in srgb, var(--color-primary-soft) 55%, white);
}

.manager-expense-preview--manager .manager-expense-total span {
  color: var(--color-ink);
  font-weight: 600;
}

.manager-expense-preview--manager .manager-expense-total strong {
  font-size: 1.625rem;
  line-height: 1;
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

  .manager-expense-preview--manager .manager-expense-lines {
    padding-inline: 2.5rem 1.5rem;
  }

  .manager-expense-preview--manager .manager-expense-row {
    grid-template-columns: minmax(0, 1fr) 9rem max-content;
    gap: 1rem;
  }
}
</style>
