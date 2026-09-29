<script setup lang="ts">
import { formatDate } from '#fsd/shared/lib'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ isAdministrator: boolean; focusId?: string }>()
const emit = defineEmits<{ resolved: [] }>()
const { t } = useI18n()
type CleaningSummary = { id: string; status: string; scheduledOn: string; cleaners: string[]; problems: { id: string; description: string; resolvedAt: string | null }[]; attachments: string[]; inventoryReports: { name: string; usedQuantity: string }[]; cashTask: { id: string; title: string; status: string; expectedAmountEur: string; collectedAmountEur: string | null; receivedAmountEur: string | null; receivedAt: string | null } | null; financial: { type: string; amountEur: number; occurredOn: string; description: string }[]; inventoryMovements: { type: string; quantity: string }[] } | null
type Conflict = { id: string; status: 'open' | 'needs_admin'; apartmentName: string; importedStay: { id: string; checkInOn: string; checkOutOn: string; icalSummary: string | null; adultCount: number | null; childCount: number | null; cleaning: CleaningSummary }; existingStay: { id: string; checkInOn: string; checkOutOn: string; guestName: string; adultCount: number | null; childCount: number | null; cleaning: CleaningSummary } }
const conflicts = ref<Conflict[]>([])
const busy = ref('')
const error = ref('')
const targetCleaning = reactive<Record<string, string>>({})
function cleaningEntries(conflict: Conflict) { return [{ label: t('icalImport.bookingCalendar'), cleaning: conflict.importedStay.cleaning }, { label: t('icalImport.bookingAparts'), cleaning: conflict.existingStay.cleaning }] }
function cleaningStatusLabel(status: string) { return ({ unassigned: t('calendarExtra.cleaningUnassigned'), assigned: t('calendarExtra.cleaningAssigned'), in_progress: t('calendarExtra.cleaningInProgress'), completed: t('calendarExtra.cleaningCompleted'), canceled: t('calendarExtra.cleaningCanceled') } as Record<string, string>)[status] ?? status }
async function load() { try { conflicts.value = await $fetch<Conflict[]>('/api/calendar-import/conflicts'); for (const conflict of conflicts.value) if (!targetCleaning[conflict.id] && conflict.importedStay.cleaning && conflict.existingStay.cleaning) targetCleaning[conflict.id] = conflict.existingStay.cleaning.id } catch { conflicts.value = [] } }
async function resolve(conflict: Conflict, decision: 'same' | 'different' | 'keep_aparts') {
  busy.value = conflict.id; error.value = ''
  try { await $fetch(`/api/calendar-import/conflicts/${conflict.id}`, { method: 'POST', body: { decision, ...(targetCleaning[conflict.id] ? { targetCleaningId: targetCleaning[conflict.id] } : {}) } }); await load(); emit('resolved') }
  catch (failure: any) { error.value = failure?.data?.statusMessage || t('common.error'); await load() }
  finally { busy.value = '' }
}
watch(() => props.focusId, async id => { await load(); if (id) await nextTick(); if (id) document.getElementById(`ical-conflict-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, { immediate: true })
watch(() => props.isAdministrator, load)
</script>

<template>
  <section v-if="conflicts.length" class="space-y-3" :aria-label="t('icalImport.conflicts')">
    <article v-for="conflict in conflicts" :id="`ical-conflict-${conflict.id}`" :key="conflict.id" class="surface space-y-3 border-s-4 border-warning p-4">
      <header class="flex items-center justify-between gap-2"><h2 class="font-semibold">{{ t('icalImport.conflictTitle', { apartment: conflict.apartmentName }) }}</h2><UBadge v-if="conflict.status === 'needs_admin'" color="warning">{{ t('icalImport.adminReview') }}</UBadge></header>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-md bg-[var(--color-elevated)] p-3"><p class="text-xs text-[var(--color-muted)]">{{ t('icalImport.bookingCalendar') }}</p><p class="font-medium">{{ conflict.importedStay.icalSummary || t('icalImport.bookingCalendar') }}</p><p>{{ formatDate(conflict.importedStay.checkInOn) }} → {{ formatDate(conflict.importedStay.checkOutOn) }}</p><p class="text-sm">{{ t('icalImport.guestsEnteredSeparately') }}</p></div>
        <div class="rounded-md bg-[var(--color-elevated)] p-3"><p class="text-xs text-[var(--color-muted)]">{{ t('icalImport.bookingAparts') }}</p><p class="font-medium">{{ conflict.existingStay.guestName || t('icalImport.bookingAparts') }}</p><p>{{ formatDate(conflict.existingStay.checkInOn) }} → {{ formatDate(conflict.existingStay.checkOutOn) }}</p></div>
      </div>
      <div v-for="entry in cleaningEntries(conflict)" :key="entry.label" class="rounded-md border border-[var(--color-border)] p-3 text-sm">
        <p class="font-medium">{{ entry.label }} · {{ entry.cleaning ? cleaningStatusLabel(entry.cleaning.status) : t('icalImport.noCleaning') }}</p>
        <template v-if="entry.cleaning">
          <p>{{ t('icalImport.cleaners') }}: {{ entry.cleaning.cleaners.join(', ') || '—' }} · {{ t('icalImport.problems') }}: {{ entry.cleaning.problems.length }} · {{ t('icalImport.attachments') }}: {{ entry.cleaning.attachments.join(', ') || '—' }}</p>
          <p>{{ t('icalImport.inventory') }}: {{ entry.cleaning.inventoryReports.map(item => `${item.name} × ${item.usedQuantity}`).join(', ') || '—' }} · {{ t('icalImport.cashTask') }}: {{ entry.cleaning.cashTask ? `${entry.cleaning.cashTask.title} · ${entry.cleaning.cashTask.status} · €${entry.cleaning.cashTask.expectedAmountEur}` : '—' }}</p>
          <ul v-if="entry.cleaning.financial.length" class="mt-1 list-inside list-disc text-[var(--color-muted)]"><li v-for="(row, index) in entry.cleaning.financial" :key="`${row.type}-${index}`">{{ row.description }} · €{{ row.amountEur }} · {{ row.occurredOn }}</li></ul>
          <ul v-if="entry.cleaning.problems.length" class="mt-1 list-inside list-disc text-[var(--color-muted)]"><li v-for="problem in entry.cleaning.problems" :key="problem.id">{{ problem.description }}</li></ul>
        </template>
      </div>
      <p v-if="conflict.status === 'needs_admin' && !isAdministrator" class="text-sm text-[var(--color-muted)]">{{ t('icalImport.waitAdmin') }}</p>
      <div v-else class="flex flex-wrap gap-2">
        <USelect v-if="isAdministrator && conflict.importedStay.cleaning && conflict.existingStay.cleaning" v-model="targetCleaning[conflict.id]" :items="[{ label: t('icalImport.bookingCalendar'), value: conflict.importedStay.cleaning.id }, { label: t('icalImport.bookingAparts'), value: conflict.existingStay.cleaning.id }]" class="min-w-48" />
        <UButton :loading="busy === conflict.id" :disabled="Boolean(busy)" @click="resolve(conflict, 'same')">{{ t('icalImport.same') }}</UButton>
        <UButton color="neutral" variant="soft" :loading="busy === conflict.id" :disabled="Boolean(busy)" @click="resolve(conflict, 'different')">{{ t('icalImport.different') }}</UButton>
        <UButton color="neutral" variant="ghost" :loading="busy === conflict.id" :disabled="Boolean(busy)" @click="resolve(conflict, 'keep_aparts')">{{ t('icalImport.keepAparts') }}</UButton>
      </div>
      <p v-if="conflict.status === 'open'" class="text-xs text-[var(--color-muted)]">{{ t('icalImport.bookingStaysActive') }}</p>
      <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    </article>
  </section>
</template>
