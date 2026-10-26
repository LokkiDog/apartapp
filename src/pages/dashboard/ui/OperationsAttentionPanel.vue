<script setup lang="ts">
import type { OperationsAttention } from '@contracts/dashboard-operations'
import { useI18n } from 'vue-i18n'
import { EmptyState, StatusBadge } from '#fsd/shared/ui'
import { formatDate } from '#fsd/shared/lib'
import { attentionQueue, primaryAttentionReason, type AttentionSelection } from '../model/attention-queue'

const props = defineProps<{ items: OperationsAttention[]; today: string }>()
const { t } = useI18n()
const selection = ref<AttentionSelection>(null)
const expanded = ref(false)
const queue = computed(() => attentionQueue(props.items, selection.value, expanded.value))
const showingAll = computed(() => queue.value.selected === 'all' && expanded.value)
function showAll() { selection.value = 'all'; expanded.value = true }
function reset() { selection.value = null; expanded.value = false }
function selectGroup(id: AttentionSelection) { selection.value = id; expanded.value = false }
function message(item: OperationsAttention) {
  const reason = primaryAttentionReason(item)
  if (reason === 'overdue') return t(item.id.startsWith('task:') ? 'operations.queue.taskOverdue' : 'operations.queue.cleaningOverdue')
  return t(`operations.queue.messages.${reason}`)
}
function context(item: OperationsAttention) {
  const reason = primaryAttentionReason(item)
  const lines: string[] = []
  if (item.preparation) lines.push(t('operations.queue.guestChange', item.preparation))
  else if (reason === 'unaccepted' && item.assigneeNames.length) lines.push(t('operations.queue.assignees', { names: item.assigneeNames.join(', ') }))
  else if (item.title) lines.push(item.title)
  else if (item.arrivalToday && item.reasons.includes('preparation') && reason !== 'preparation') lines.push(t('operations.states.unknown'))
  else if (item.date) lines.push(formatDate(item.date))
  const otherReasons = item.reasons.filter(r => r !== reason && r !== 'preparation')
  if (otherReasons.length) lines.push(otherReasons.map(r => t(`operations.reasons.${r}`)).join(' · '))
  return lines
}
function urgency(item: OperationsAttention) {
  return item.reasons.some(reason => reason === 'unassigned' || reason === 'unaccepted')
}
function badge(item: OperationsAttention) {
  if (item.arrivalToday) return t('operations.queue.arrivalToday')
  if (item.reasons.includes('overdue')) return t('operations.reasons.overdue')
  if (item.reasons.includes('review')) return t('operations.queue.reviewBadge')
  return item.date === props.today ? t('operations.today') : item.date ? formatDate(item.date) : null
}
</script>

<template>
  <section class="attention-panel surface overflow-hidden" aria-labelledby="operations-attention-title">
    <header class="attention-panel__header">
      <h2 id="operations-attention-title" class="flex min-w-0 items-center gap-2 font-semibold">
        {{ t('operations.attention') }}
        <UBadge color="neutral" variant="soft" class="tabular-nums">{{ items.length }}</UBadge>
      </h2>
      <UButton v-if="items.length" class="min-h-11 shrink-0 cursor-pointer" color="primary" variant="ghost" :trailing-icon="showingAll ? 'i-lucide-chevron-up' : 'i-lucide-arrow-right'" :aria-expanded="showingAll" aria-controls="attention-records" @click="showingAll ? reset() : showAll()">
        {{ t(showingAll ? 'operations.collapse' : 'operations.queue.allRecords') }}
      </UButton>
    </header>

    <div v-if="items.length" class="attention-panel__filters" role="group" :aria-label="t('operations.queue.filterLabel')">
      <UButton v-for="group in queue.groups" :key="group.id" color="primary" :variant="queue.selected === group.id ? 'soft' : 'ghost'" class="attention-panel__filter min-h-11 shrink-0 cursor-pointer" :class="{ 'attention-panel__filter--selected': queue.selected === group.id }" :aria-pressed="queue.selected === group.id" aria-controls="attention-records" @click="selectGroup(group.id)">
        {{ t(`operations.queue.groups.${group.id}`) }}
        <span class="tabular-nums" :class="queue.selected === group.id ? 'font-semibold' : 'text-[var(--color-muted)]'">{{ group.count }}</span>
      </UButton>
    </div>

    <div id="attention-records" class="attention-panel__records">
      <article v-for="(item, index) in queue.visible" :key="item.id" class="attention-row" :class="{ 'attention-row--urgent': index === 0 && item.arrivalToday && urgency(item) }">
        <div class="attention-row__content">
          <div class="attention-row__heading">
            <div class="attention-row__property">
              <NuxtLink :to="item.href" class="attention-row__name">{{ item.apartment.name }}</NuxtLink>
              <span class="attention-row__hotel">{{ item.apartment.hotel.name }}</span>
            </div>
            <StatusBadge v-if="badge(item)" class="attention-row__badge" :label="badge(item)!" :tone="item.arrivalToday && urgency(item) ? 'warning' : 'neutral'" />
          </div>
          <p class="attention-row__message">{{ message(item) }}</p>
          <p v-for="(line, lineIndex) in context(item)" :key="lineIndex" class="attention-row__context">{{ line }}</p>
        </div>
        <UButton :to="item.action.href" :variant="item.action.kind === 'assign' ? 'solid' : 'outline'" color="primary" class="attention-row__action min-h-11 cursor-pointer justify-center" :aria-label="t('operations.queue.actionFor', { action: t(`operations.queue.actions.${item.action.kind}`), apartment: item.apartment.name })">
          {{ t(`operations.queue.actions.${item.action.kind}`) }}
        </UButton>
      </article>
      <EmptyState v-if="!items.length" icon="i-lucide-circle-check" :title="t('operations.calm')" :description="t('operations.calmDescription')" />
      <EmptyState v-else-if="!queue.visible.length" icon="i-lucide-circle-check" :title="t('operations.queue.groupEmpty')" />
    </div>

    <footer v-if="items.length" class="attention-panel__footer">
      <p class="text-sm tabular-nums text-[var(--color-muted)]">{{ t('operations.queue.showing', { count: queue.visible.length, total: items.length }) }}</p>
      <UButton v-if="queue.remaining" color="primary" variant="ghost" trailing-icon="i-lucide-arrow-right" class="min-h-11 cursor-pointer" @click="showAll">{{ t('operations.queue.more', { count: queue.remaining }) }}</UButton>
      <UButton v-else-if="showingAll && items.length > 3" color="primary" variant="ghost" class="min-h-11 cursor-pointer" @click="reset">{{ t('operations.collapse') }}</UButton>
    </footer>
  </section>
</template>

<style scoped>
.attention-panel__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; padding: 8px 20px 4px; }
.attention-panel__filters { display: flex; gap: 8px; overflow-x: auto; padding: 0 20px 8px; scrollbar-width: thin; }
.attention-panel__filter { gap: 12px; white-space: nowrap; color: var(--color-muted); }
.attention-panel__filter--selected { color: var(--color-primary-strong); }
.attention-panel__records { margin-inline: 20px; border-top: 1px solid var(--color-line); }
.attention-row { display: flex; flex-direction: column; gap: 8px; padding-block: 12px; }
.attention-row + .attention-row { border-top: 1px solid var(--color-line); }
.attention-row--urgent { background: color-mix(in srgb, var(--tone-warning-bg) 26%, var(--color-surface)); }
.attention-row__content { min-width: 0; flex: 1; }
.attention-row__heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.attention-row__property { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.attention-row__name { display: inline-flex; min-height: 44px; align-items: center; min-width: 0; overflow-wrap: anywhere; color: var(--color-ink); font-size: 18px; font-weight: 650; border-radius: 4px; cursor: pointer; transition: color 150ms; }
.attention-row__name:hover { color: var(--color-primary); }
.attention-row__name:active { color: var(--color-primary-strong); }
.attention-row__name:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.attention-row__hotel { color: var(--color-muted); font-size: 14px; overflow-wrap: anywhere; }
.attention-row__badge { justify-self: end; white-space: nowrap; }
.attention-row__badge :deep(.status-badge__dot) { display: none; }
.attention-row__message { margin-top: 2px; color: var(--color-ink); font-size: 16px; line-height: 22px; font-weight: 550; }
.attention-row__context { margin-top: 2px; color: var(--color-muted); font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
.attention-row__action { width: 100%; flex-shrink: 0; }
.attention-panel__footer { display: flex; min-height: 52px; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-inline: 20px; border-top: 1px solid var(--color-line); padding-block: 4px; }
@media (min-width: 640px) {
  .attention-panel__header { padding-inline: 24px; }
  .attention-panel__filters { gap: 16px; padding-inline: 24px; }
  .attention-panel__records, .attention-panel__footer { margin-inline: 24px; }
  .attention-row { flex-direction: row; align-items: center; gap: 16px; padding-block: 12px; }
  .attention-row__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .attention-row__property { flex: 0 1 auto; }
  .attention-row__name { font-size: 20px; }
  .attention-row__action { width: 144px; min-width: 144px; }
}
@media (prefers-reduced-motion: reduce) { .attention-row__name { transition: none; } }
</style>
