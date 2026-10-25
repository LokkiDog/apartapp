<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { createManagerExpenseCategoryVisibility, managerExpenseCategoryLines, visibleManagerExpenseCategories, type ManagerExpenseCategory as Category, type ManagerExpenseCategoryVisibility, type ManagerExpenseLine as Line } from '../model/manager-expense-report'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{ lines: Line[], totalEur: number, categoryVisibility?: ManagerExpenseCategoryVisibility, editable?: boolean, editingLineId?: string | null, embedded?: boolean }>(), { categoryVisibility: createManagerExpenseCategoryVisibility, editable: false, editingLineId: null, embedded: false })
const emit = defineEmits<{
  select: [id: string]
  updateCategoryVisibility: [category: Category, enabled: boolean]
  updateIncluded: [id: string, included: boolean]
  close: []
  update: [id: string, patch: Partial<Pick<Line, 'description' | 'occurredOn' | 'amountEur'>>]
  remove: [id: string]
}>()
const { t } = useI18n()
const labels = computed<Record<Category, string>>(() => ({ cleaning: t('work.cleanings'), inventory: t('reports.procurement'), task: t('work.tasks'), other: t('reports.finance') }))
const categories = computed(() => visibleManagerExpenseCategories(props.categoryVisibility, props.editable))
const managerPresentation = computed(() => !props.editable && !props.embedded)
function categoryLines(category: Category) { return managerExpenseCategoryLines(props.lines, category) }
function categoryTotal(category: Category) { return Number(categoryLines(category).reduce((sum, line) => sum.plus(line.amountEur), new Decimal(0)).toDecimalPlaces(2)) }
const expandedCategories = ref<Record<Category, boolean>>({ cleaning: true, inventory: false, task: true, other: true })
const categoryId = useId()
function showCategoryLines(category: Category) { return expandedCategories.value[category] }
function toggleCategory(category: Category) {
  expandedCategories.value[category] = !expandedCategories.value[category]
  if (!expandedCategories.value[category] && props.lines.find(line => line.id === props.editingLineId)?.category === category) emit('close')
}
watch(() => props.editingLineId, id => {
  const line = props.lines.find(line => line.id === id)
  if (line) expandedCategories.value[line.category] = true
})
function clearZeroAmount(event: FocusEvent) {
  const input = event.target
  if (input instanceof HTMLInputElement && Number(input.value) === 0) input.value = ''
}
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
            type="button"
            class="manager-expense-category-toggle flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 text-left"
            :aria-expanded="showCategoryLines(category)"
            :aria-controls="`${categoryId}-${category}`"
            @click="toggleCategory(category)"
          >
            <h2 class="min-w-0 font-semibold">{{ labels[category] }}</h2>
            <strong class="tabular-nums">{{ formatEuro(categoryTotal(category)) }}</strong>
          </button>
        </div>
        <div v-show="showCategoryLines(category)" :id="`${categoryId}-${category}`" class="manager-expense-lines">
          <template v-for="line in categoryLines(category)" :key="line.id">
            <form v-if="editable && editingLineId === line.id" class="manager-expense-editor" :class="{ 'manager-expense-editor--cleaning': category === 'cleaning' }" @submit.prevent="emit('close')">
              <UInput v-if="category !== 'cleaning'" class="manager-expense-editor__description w-full" :model-value="line.description" :placeholder="t('hotels.name')" autofocus @update:model-value="value => emit('update', line.id, { description: value })" />
              <UInput class="w-full" :model-value="line.occurredOn ?? ''" type="date" @update:model-value="value => emit('update', line.id, { occurredOn: value || null })" />
              <UInput class="w-full" :model-value="line.amountEur" type="number" step="0.01" @focus="clearZeroAmount" @update:model-value="value => emit('update', line.id, { amountEur: Number(value) || 0 })" />
              <div class="manager-expense-editor__actions flex gap-1"><UButton type="submit" color="neutral" variant="ghost" icon="i-lucide-check" :aria-label="t('common.save')" class="min-h-11 min-w-11" /><UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('common.delete')" class="min-h-11 min-w-11" @click="emit('remove', line.id)" /></div>
            </form>
            <div
              v-else
              class="manager-expense-row"
              :class="{ 'manager-expense-row--selectable': editable && line.problemId, 'opacity-55': !line.included }"
            >
              <UCheckbox
                v-if="editable && line.problemId"
                :model-value="line.included"
                :aria-label="line.included ? t('common.hide') : t('common.show')"
                class="min-h-11 min-w-11 items-center justify-center"
                @update:model-value="value => emit('updateIncluded', line.id, value === true)"
              />
              <button type="button" class="manager-expense-row__detail" :disabled="!editable" @click="emit('select', line.id)">
                <span class="manager-expense-row__content">
                  <span class="manager-expense-row__title">{{ category === 'cleaning' ? (line.occurredOn ? formatDate(line.occurredOn) : '') : line.description }}</span>
                  <span v-if="category !== 'cleaning' && (line.occurredOn || (line.problemId && !line.included))" class="manager-expense-row__meta">
                    <span v-if="line.occurredOn">{{ formatDate(line.occurredOn) }}</span>
                    <span v-if="line.problemId && !line.included">{{ t('problems.open') }}</span>
                  </span>
                </span>
                <span class="manager-expense-row__amount tabular-nums">{{ formatEuro(line.amountEur) }}</span>
              </button>
            </div>
          </template>
        </div>
      </section>
      <section v-if="managerPresentation" class="manager-expense-total flex items-center justify-between gap-4 px-5 sm:px-6"><span class="text-sm text-[var(--color-muted)]">{{ t('reports.currentTotal') }}</span><strong class="text-2xl tracking-[-0.03em] tabular-nums">{{ formatEuro(totalEur) }}</strong></section>
    </div>
    <section v-if="!managerPresentation" :class="embedded ? 'flex items-center justify-between gap-4 px-5 py-5 sm:px-6' : 'manager-expense-total surface flex items-center justify-between gap-4 p-5 sm:p-6'"><span class="text-sm text-[var(--color-muted)]">{{ t('reports.currentTotal') }}</span><strong class="text-2xl tracking-[-0.03em] tabular-nums">{{ formatEuro(totalEur) }}</strong></section>
  </div>
</template>

<style scoped>
.manager-expense-category-toggle {
  cursor: pointer;
  transition: background-color 150ms;
}

.manager-expense-category-toggle:hover {
  background-color: var(--color-surface-muted);
}

.manager-expense-category-toggle:active {
  background-color: var(--color-primary-soft);
}

.manager-expense-category-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .manager-expense-category-toggle {
    transition: none;
  }
}

.manager-expense-category-header,
.manager-expense-category-header h2 {
  text-align: left;
}

.manager-expense-lines {
  padding-inline: 2.5rem 1.25rem;
}

.manager-expense-lines > :not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--color-line) 32%, transparent);
}

.manager-expense-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  color: var(--color-muted);
  font-size: .875rem;
  line-height: 1.4;
}

.manager-expense-row--selectable {
  grid-template-columns: 2.75rem minmax(0, 1fr);
}

.manager-expense-row__detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(6rem, max-content);
  align-items: center;
  gap: .75rem;
  min-width: 0;
  min-height: 2.75rem;
  padding-block: .375rem;
  text-align: start;
  transition: background-color 150ms;
}

.manager-expense-row__detail:enabled {
  cursor: pointer;
}

.manager-expense-row__detail:enabled:hover {
  background-color: var(--color-surface-muted);
}

.manager-expense-row__detail:enabled:active {
  background-color: var(--color-primary-soft);
}

.manager-expense-row__detail:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.manager-expense-row__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: .125rem;
}

.manager-expense-row__title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.manager-expense-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: .25rem .5rem;
  font-size: .75rem;
}

.manager-expense-row__amount {
  justify-self: end;
  white-space: nowrap;
  font-weight: 500;
  text-align: end;
}

.manager-expense-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: .5rem;
  padding-block: .5rem;
}

.manager-expense-editor__description,
.manager-expense-editor__actions {
  grid-column: 1 / -1;
}

.manager-expense-editor__actions {
  justify-self: end;
}

@media (prefers-reduced-motion: reduce) {
  .manager-expense-row__detail {
    transition: none;
  }
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

.manager-expense-preview--manager .manager-expense-category-header strong {
  justify-self: end;
  text-align: right;
}

.manager-expense-preview--manager .manager-expense-lines {
  padding-inline: 2rem 1.25rem;
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

  .manager-expense-preview--manager .manager-expense-lines {
    padding-inline: 2.5rem 1.5rem;
  }

  .manager-expense-row__content {
    flex-direction: row;
    align-items: baseline;
    gap: 1rem;
  }

  .manager-expense-row__title {
    flex: 1;
  }

  .manager-expense-row__meta {
    justify-content: flex-end;
    flex-shrink: 0;
  }
}

@media (min-width: 768px) {
  .manager-expense-editor {
    grid-template-columns: minmax(0, 1fr) minmax(8rem, 10rem) minmax(6rem, 8rem) auto;
  }

  .manager-expense-editor--cleaning {
    grid-template-columns: minmax(8rem, 10rem) minmax(6rem, 8rem) auto;
  }

  .manager-expense-editor__description,
  .manager-expense-editor__actions {
    grid-column: auto;
  }
}
</style>
