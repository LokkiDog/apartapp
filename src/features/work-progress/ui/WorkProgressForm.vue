<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'
import { createFormValidator, formatDateTime, useSubmitFormValidation } from '#fsd/shared/lib'
import { workProgressInputSchema } from '@contracts/crm'

type ChecklistItem = { label: string; checked: boolean }
type WorkAttachment = { id: string; fileName: string }
type CleaningProblemSource = { id: string; description: string; attachments: WorkAttachment[] }
type CleaningProblemDraft = CleaningProblemSource & { photos: File[]; previews: Array<{ file: File; url: string }> }
type InventoryReportSource = { id: string; reportedBy: { id: string; name: string }; reportedAt: string; appliedAt: string | null; approvedAt: string | null; approvedBy: { id: string; name: string } | null; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; startingQuantity: number; expectedRemainingQuantity: number }
type InventoryItem = { consumable: { id: string; name: string; unit: string }; autoWriteOffQuantity: number | null; quantity: number; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; startingQuantity: number; expectedRemainingQuantity: number; report: InventoryReportSource | null; remainingTouched?: boolean }
type ProgressPayload = { checklist: ChecklistItem[]; comment: string; hasProblem: boolean; problemDescription: string; problems: Array<{ id: string; description: string; photos: File[] }>; inventoryReports?: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>; photos: File[] }
const { t } = useI18n()

const props = withDefaults(defineProps<{
  kind: 'cleaning' | 'task'
  checklist: ChecklistItem[]
  comment?: string
  hasProblem?: boolean
  problemDescription?: string
  problems?: CleaningProblemSource[]
  inventoryReports?: InventoryItem[]
  attachments?: Array<{ id: string; fileName: string }>
  focusConsumableId?: string
  editable?: boolean
  canComplete?: boolean
  canStock?: boolean
  inventoryEditable?: boolean
  canApproveInventoryDiscrepancy?: boolean
  busy?: boolean
  error?: string
  finishHint?: string
}>(), { comment: '', hasProblem: false, problemDescription: '', problems: () => [], inventoryReports: () => [], attachments: () => [], focusConsumableId: '', editable: false, canComplete: false, canStock: false, inventoryEditable: false, canApproveInventoryDiscrepancy: false, busy: false, error: '', finishHint: '' })

const emit = defineEmits<{ save: [payload: ProgressPayload]; complete: [payload: ProgressPayload]; saveInventory: [reports: NonNullable<ProgressPayload['inventoryReports']>]; approveInventoryDiscrepancy: [item: InventoryItem]; stock: [] }>()
const checklist = ref<ChecklistItem[]>([])
const comment = ref('')
const hasProblem = ref(false)
const problemDescription = ref('')
const problems = ref<CleaningProblemDraft[]>([])
const photos = ref<File[]>([])
const photoPreviews = ref<Array<{ file: File; url: string }>>([])
const inventoryReports = ref<InventoryItem[]>([])
const submitIntent = ref<'save' | 'complete'>('save')
const validationError = ref('')
const validation = useSubmitFormValidation()
const validationState = computed(() => ({
  checklist: checklist.value,
  comment: comment.value,
  hasProblem: hasProblem.value,
  problemDescription: problemDescription.value,
  problems: props.kind === 'cleaning' ? problems.value.map(problem => ({ id: problem.id, description: problem.description })) : [],
  inventoryReports: props.kind === 'cleaning' ? inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: item.usedQuantity, remainingQuantity: item.remainingQuantity })) : undefined
}))
const validateProgress = createFormValidator(workProgressInputSchema, t, {
  validate: (state) => submitIntent.value === 'complete'
    ? (state as ProgressPayload).checklist.flatMap((item, index) => item.checked ? [] : [{ name: `checklist.${index}.checked`, message: t('work.incompleteHint') }])
    : []
})

watch(() => [props.checklist, props.comment, props.hasProblem, props.problemDescription, props.problems, props.inventoryReports], () => {
  clearProblemPhotoPreviews()
  checklist.value = props.checklist.map(item => ({ ...item }))
  comment.value = props.comment
  hasProblem.value = props.hasProblem
  problemDescription.value = props.problemDescription
  problems.value = props.problems.map(problem => ({ ...problem, attachments: problem.attachments.map(attachment => ({ ...attachment })), photos: [], previews: [] }))
  inventoryReports.value = props.inventoryReports.map(item => ({ ...item, consumable: { ...item.consumable }, remainingTouched: false }))
}, { immediate: true, deep: true })

watch(() => [props.focusConsumableId, props.inventoryReports.length], async () => {
  if (!import.meta.client || !props.focusConsumableId || !props.inventoryReports.length) return
  await nextTick()
  const row = document.getElementById(`progress-stock-${props.focusConsumableId}`)
  row?.focus({ preventScroll: true })
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, { immediate: true })

function syncExpectedRemaining(item: InventoryItem) {
  if (!item.remainingTouched) item.remainingQuantity = Math.max(0, Number(item.startingQuantity) - (Number(item.usedQuantity) || 0))
}

function liveExpectedRemaining(item: InventoryItem) { return Math.max(0, Number((Number(item.startingQuantity) - (Number(item.usedQuantity) || 0)).toFixed(3))) }
function liveDiscrepancy(item: InventoryItem) { return Number(((Number(item.remainingQuantity) || 0) - liveExpectedRemaining(item)).toFixed(3)) }
function reportValuesAreCurrent(item: InventoryItem) {
  return Boolean(item.report)
    && Number(item.usedQuantity).toFixed(3) === Number(item.report?.usedQuantity).toFixed(3)
    && Number(item.remainingQuantity).toFixed(3) === Number(item.report?.remainingQuantity).toFixed(3)
}
function approvalIsCurrent(item: InventoryItem) { return Boolean(item.report?.approvedAt) && reportValuesAreCurrent(item) }

function payload(): ProgressPayload {
  return {
    checklist: checklist.value.map(item => ({ ...item })),
    comment: comment.value,
    hasProblem: hasProblem.value,
    problemDescription: problemDescription.value,
    problems: props.kind === 'cleaning' ? problems.value.map(problem => ({ id: problem.id, description: problem.description, photos: problem.photos })) : [],
    inventoryReports: props.kind === 'cleaning' ? inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: Number(item.usedQuantity) || 0, remainingQuantity: Number(item.remainingQuantity) || 0 })) : undefined,
    photos: photos.value
  }
}
function clearPhotoPreviews() {
  if (import.meta.client) photoPreviews.value.forEach(preview => URL.revokeObjectURL(preview.url))
  photoPreviews.value = []
}
function choosePhotos(event: Event) {
  clearPhotoPreviews()
  photos.value = Array.from((event.target as HTMLInputElement).files ?? [])
  if (import.meta.client) photoPreviews.value = photos.value.map(file => ({ file, url: URL.createObjectURL(file) }))
}
function addProblem() {
  problems.value.push({ id: crypto.randomUUID(), description: '', attachments: [], photos: [], previews: [] })
}
function removeProblem(index: number) {
  if (import.meta.client) problems.value[index]?.previews.forEach(preview => URL.revokeObjectURL(preview.url))
  problems.value.splice(index, 1)
}
function chooseProblemPhotos(event: Event, problem: CleaningProblemDraft) {
  if (import.meta.client) problem.previews.forEach(preview => URL.revokeObjectURL(preview.url))
  problem.photos = Array.from((event.target as HTMLInputElement).files ?? [])
  problem.previews = import.meta.client ? problem.photos.map(file => ({ file, url: URL.createObjectURL(file) })) : []
}
function clearProblemPhotoPreviews() {
  if (import.meta.client) problems.value.forEach(problem => problem.previews.forEach(preview => URL.revokeObjectURL(preview.url)))
}
function submit() {
  validationError.value = ''
  if (submitIntent.value === 'complete') emit('complete', payload())
  else emit('save', payload())
  submitIntent.value = 'save'
}
async function onValidationError(event: FormErrorEvent) {
  validationError.value = event.errors[0]?.message ?? t('validation.invalid')
  await validation.onError(event)
}
const unfinished = computed(() => checklist.value.filter(item => !item.checked).length)

watch(validationState, (state) => {
  if (validationError.value && !validateProgress(state).length) validationError.value = ''
}, { deep: true })

onBeforeUnmount(() => { clearPhotoPreviews(); clearProblemPhotoPreviews() })
</script>

<template>
  <UForm :key="validation.formKey.value" :state="validationState" :validate="validateProgress" :validate-on="validation.validateOn.value" novalidate class="work-progress-form" @error="onValidationError" @submit="submit">
    <UAlert v-if="validationError || error" color="error" variant="soft" :description="validationError || error" />
    <section class="progress-section" :class="{ 'progress-section--attention': finishHint }">
      <div class="progress-section__heading"><div><h2>{{ t('progress.checklist') }}</h2><p>{{ unfinished ? t('progress.remainingItems', { count: unfinished }) : t('progress.allDone') }}</p></div><UIcon :name="unfinished ? 'i-lucide-list-checks' : 'i-lucide-circle-check'" class="size-5" :class="unfinished ? 'text-[var(--color-muted)]' : 'text-[var(--color-success)]'" /></div>
      <p v-if="finishHint" class="mb-3 text-sm font-medium text-amber-800">{{ finishHint }}</p>
      <div v-if="checklist.length" class="space-y-1"><UFormField v-for="(item, index) in checklist" :key="item.label" :name="`checklist.${index}.checked`" :error="false"><UCheckbox v-model="item.checked" :label="item.label" :disabled="!editable" class="min-h-11 items-center" /></UFormField></div>
      <p v-else class="text-sm text-[var(--color-muted)]">{{ t('progress.notConfiguredChecklist') }}</p>
    </section>

    <section v-if="kind === 'cleaning'" class="progress-section">
      <div class="progress-section__heading"><div><h2>{{ t('progress.stock') }}</h2><p class="progress-section__mobile-description">{{ t('progress.stockDescription') }}</p></div><UIcon name="i-lucide-package" class="size-5 text-[var(--color-primary)]" /></div>
      <div v-if="inventoryReports.length" class="progress-stock-list space-y-3">
        <div v-for="(item, index) in inventoryReports" :id="`progress-stock-${item.consumable.id}`" :key="item.consumable.id" class="progress-stock-row" :class="{ 'progress-stock-row--focused': focusConsumableId === item.consumable.id }" :tabindex="focusConsumableId === item.consumable.id ? -1 : undefined">
          <div><p class="font-medium">{{ item.consumable.name }}</p><p class="text-sm text-[var(--color-muted)]">{{ t('progress.current') }}: {{ item.quantity }} {{ item.consumable.unit }}<span v-if="item.autoWriteOffQuantity !== null"> · {{ t('inventory.auto') }}: {{ item.autoWriteOffQuantity }} {{ item.consumable.unit }}</span></p></div>
          <div v-if="focusConsumableId === item.consumable.id && item.report" class="progress-stock-source mt-3">
            <div class="flex items-start gap-2"><UIcon name="i-lucide-search-check" class="mt-0.5 size-4 shrink-0 text-amber-700" /><div><p class="text-sm font-semibold text-amber-950">{{ t('inventoryDiscrepancy.source') }}</p><p class="text-xs text-amber-900/75">{{ item.report.reportedBy.name }} · {{ formatDateTime(item.report.reportedAt) }}</p></div></div>
            <dl class="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3"><div><dt>{{ t('inventoryDiscrepancy.beforeCleaning') }}</dt><dd>{{ item.report.startingQuantity }} {{ item.consumable.unit }}</dd></div><div><dt>{{ t('inventoryDiscrepancy.expected') }}</dt><dd>{{ item.report.expectedRemainingQuantity }} {{ item.consumable.unit }}</dd></div><div><dt>{{ t('inventoryDiscrepancy.reported') }}</dt><dd>{{ item.report.remainingQuantity }} {{ item.consumable.unit }}</dd></div></dl>
          </div>
          <div class="progress-stock-fields mt-3 grid grid-cols-2 gap-3"><UFormField :name="`inventoryReports.${index}.usedQuantity`" :error="false"><template #label><span class="progress-stock-label--desktop">{{ t('progress.used') }}</span><span class="progress-stock-label--mobile">{{ t('progress.used') }}</span></template><UInput v-model.number="item.usedQuantity" type="number" min="0" step=".001" :disabled="!editable && !inventoryEditable" @update:model-value="syncExpectedRemaining(item)"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField><UFormField :name="`inventoryReports.${index}.remainingQuantity`" :label="t('progress.remaining')" :error="false"><UInput v-model.number="item.remainingQuantity" type="number" min="0" step=".001" :disabled="!editable && !inventoryEditable" @update:model-value="item.remainingTouched = true"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField></div>
          <p v-if="focusConsumableId === item.consumable.id" class="mt-2 text-xs text-[var(--color-muted)]">{{ t('inventoryDiscrepancy.expectedAfterCorrection') }}: {{ liveExpectedRemaining(item) }} {{ item.consumable.unit }}</p>
          <div v-if="approvalIsCurrent(item) && item.report?.approvedAt" class="mt-3 flex items-center gap-2 text-xs font-medium text-[var(--color-success)]"><UIcon name="i-lucide-circle-check" class="size-4 shrink-0" /><span>{{ t('inventoryApproval.approvedBy', { name: item.report.approvedBy?.name ?? t('inventoryApproval.administrator'), date: formatDateTime(item.report.approvedAt) }) }}</span></div>
          <p v-else-if="liveDiscrepancy(item)" class="mt-2 text-xs text-amber-700">{{ t('progress.discrepancy') }}: {{ liveDiscrepancy(item) > 0 ? '+' : '' }}{{ liveDiscrepancy(item) }} {{ item.consumable.unit }}</p>
          <UButton v-if="canApproveInventoryDiscrepancy && item.report && item.report.discrepancyQuantity !== 0 && !item.report.approvedAt && reportValuesAreCurrent(item)" type="button" color="neutral" variant="soft" icon="i-lucide-circle-check" class="mt-3 min-h-11" @click="emit('approveInventoryDiscrepancy', item)">{{ t('inventoryApproval.confirm') }}</UButton>
        </div>
      </div>
      <p v-else class="text-sm text-[var(--color-muted)]">{{ t('progress.notConfigured') }}</p>
      <UButton v-if="canStock" type="button" color="neutral" variant="soft" icon="i-lucide-package-minus" class="mt-4" @click="emit('stock')">{{ t('progress.manualStock') }}</UButton>
      <UButton v-if="inventoryEditable" type="button" color="neutral" variant="soft" icon="i-lucide-save" class="mt-3" :loading="busy" @click="emit('saveInventory', inventoryReports.map(item => ({ consumableId: item.consumable.id, usedQuantity: Number(item.usedQuantity) || 0, remainingQuantity: Number(item.remainingQuantity) || 0 })))">{{ t('progress.saveStock') }}</UButton>
    </section>

    <section class="progress-section">
      <div class="progress-section__heading"><div><h2>{{ t('progress.commentProblem') }}</h2></div><UIcon name="i-lucide-message-square-text" class="size-5 text-[var(--color-primary)]" /></div>
      <UFormField name="comment" :label="t('progress.comment')" :error="false" class="w-full"><UTextarea v-model="comment" class="w-full" :disabled="!editable" :rows="4" :placeholder="t('progress.commentPlaceholder')" /></UFormField>
      <template v-if="kind === 'cleaning'">
        <div class="mt-4 flex items-center justify-between gap-3"><h3 class="font-semibold">{{ t('progress.problems') }}</h3><UButton v-if="editable" type="button" color="neutral" variant="soft" icon="i-lucide-plus" class="min-h-11" @click="addProblem">{{ t('progress.addProblem') }}</UButton></div>
        <div v-if="problems.length" class="mt-3 grid gap-3">
          <article v-for="(problem, problemIndex) in problems" :key="problem.id" class="work-problem-card">
            <div class="flex items-start gap-2"><UFormField :name="`problems.${problemIndex}.description`" :label="t('progress.problemDescription')" class="min-w-0 flex-1"><UTextarea v-model="problem.description" class="w-full" :disabled="!editable" :rows="3" :placeholder="t('progress.problemPlaceholder')" /></UFormField><UButton v-if="editable" type="button" color="error" variant="ghost" icon="i-lucide-trash-2" class="min-h-11 min-w-11" :aria-label="t('progress.removeProblem')" @click="removeProblem(problemIndex)" /></div>
            <div v-if="problem.attachments.length || problem.previews.length" class="work-attachment-gallery mt-3">
              <a v-for="attachment in problem.attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}/file`" target="_blank" rel="noreferrer" class="work-attachment-card"><img :src="`/api/attachments/${attachment.id}/file?variant=card`" :alt="attachment.fileName" class="work-attachment-card__image" /><span class="work-attachment-card__name">{{ attachment.fileName }}</span></a>
              <figure v-for="preview in problem.previews" :key="preview.url" class="work-attachment-card work-attachment-card--preview"><img :src="preview.url" :alt="preview.file.name" class="work-attachment-card__image" /><figcaption class="work-attachment-card__name">{{ preview.file.name }}</figcaption></figure>
            </div>
            <UFormField :label="t('progress.problemPhotos')" class="mt-3"><UInput type="file" accept="image/*" multiple :disabled="!editable" @change="chooseProblemPhotos($event, problem)" /></UFormField>
          </article>
        </div>
      </template>
      <template v-else>
        <UCheckbox v-model="hasProblem" :label="t('progress.problem')" :disabled="!editable" class="mt-4 min-h-11 items-center font-medium" />
        <UFormField v-if="hasProblem" name="problemDescription" :label="t('progress.problemDescription')" :error="false" class="mt-3 w-full"><UTextarea v-model="problemDescription" class="w-full" :disabled="!editable" :rows="3" :placeholder="t('progress.problemPlaceholder')" /></UFormField>
      </template>
    </section>

    <section v-if="kind === 'task'" class="progress-section">
      <div class="progress-section__heading"><div><h2>{{ t('work.photos') }}</h2><p>{{ t('progress.photoHint') }}</p></div><UIcon name="i-lucide-camera" class="size-5 text-[var(--color-primary)]" /></div>
      <div v-if="attachments.length || photoPreviews.length" class="work-attachment-gallery">
        <a v-for="attachment in attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}/file`" target="_blank" rel="noreferrer" class="work-attachment-card">
          <img :src="`/api/attachments/${attachment.id}/file?variant=card`" :alt="attachment.fileName" class="work-attachment-card__image" />
          <span class="work-attachment-card__name">{{ attachment.fileName }}</span>
        </a>
        <figure v-for="preview in photoPreviews" :key="preview.url" class="work-attachment-card work-attachment-card--preview">
          <img :src="preview.url" :alt="preview.file.name" class="work-attachment-card__image" />
          <figcaption class="work-attachment-card__name">{{ preview.file.name }}</figcaption>
        </figure>
      </div>
      <UInput type="file" accept="image/*" multiple :disabled="!editable" @change="choosePhotos" />
    </section>

    <div v-if="editable || canComplete" class="work-progress-actions" :class="{ 'work-progress-actions--in-cleaning': kind === 'cleaning' }">
      <template v-if="kind === 'cleaning'">
        <div class="work-progress-actions__secondary"><slot name="actions-left" /></div>
        <div class="work-progress-actions__primary">
          <UButton v-if="editable" type="submit" color="neutral" variant="soft" icon="i-lucide-save" :loading="busy" @click="submitIntent = 'save'">{{ t('progress.save') }}</UButton>
          <UButton v-if="canComplete" type="submit" icon="i-lucide-circle-check" :loading="busy" @click="submitIntent = 'complete'">{{ t('progress.complete') }}</UButton>
        </div>
      </template>
      <template v-else>
        <UButton v-if="editable" type="submit" color="neutral" variant="soft" icon="i-lucide-save" :loading="busy" @click="submitIntent = 'save'">{{ t('progress.save') }}</UButton>
        <UButton v-if="canComplete" type="submit" icon="i-lucide-circle-check" :loading="busy" @click="submitIntent = 'complete'">{{ t('progress.complete') }}</UButton>
      </template>
    </div>
  </UForm>
</template>
