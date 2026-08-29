<script setup lang="ts">
import type { Cleaning } from '#fsd/entities/cleaning'
import type { Task } from '#fsd/entities/task'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { useI18n } from 'vue-i18n'
import { DeleteConfirmModal, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { WorkProgressForm } from '#fsd/features/work-progress'

type WorkKind = 'cleaning' | 'task'
type InventoryItem = { consumable: { id: string; name: string; unit: string }; autoWriteOffQuantity: number | null; quantity: number; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number }
type ProgressPayload = { checklist: Array<{ label: string; checked: boolean }>; comment: string; hasProblem: boolean; problemDescription: string; inventoryReports?: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>; photo: File | null }

const props = defineProps<{ kind: WorkKind }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const currentUser = useCurrentUser()
const id = String(route.params.id)
const isAdministrator = computed(() => Boolean(currentUser.value?.roles.includes('administrator')))
const workRequest = await useAsyncData(`work-detail-${props.kind}-${id}`, () => currentUser.value ? $fetch<Cleaning | Task>(`/api/${props.kind}s/${id}`) : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] })
const work = workRequest.data as Ref<Cleaning | Task | null>
const { status, refresh } = workRequest
const inventoryReports = ref<InventoryItem[]>([])
const inventoryLoaded = ref(false)
const attachments = ref<Array<{ id: string; fileName: string; mimeType: string }>>([])
const error = ref('')
const finishHint = ref('')
const pending = ref(false)
const deleteOpen = ref(false)
const stockOpen = ref(false)
const stockItems = ref<Array<{ consumable: { id: string; name: string; unit: string }; quantity: number }>>([])
const usageForm = reactive({ consumableId: '', quantity: 1, note: '' })

const cleaning = computed(() => props.kind === 'cleaning' ? work.value as Cleaning | null : null)
const task = computed(() => props.kind === 'task' ? work.value as Task | null : null)
const assignedToCurrent = computed(() => props.kind === 'cleaning'
  ? Boolean(cleaning.value?.assignments.some(item => item.cleanerId === currentUser.value?.id))
  : task.value?.assigneeId === currentUser.value?.id)
const canProgress = computed(() => Boolean(work.value && !['completed', 'canceled'].includes(work.value.status) && (isAdministrator.value || assignedToCurrent.value)))
const canComplete = computed(() => canProgress.value)
const inventoryEditable = computed(() => Boolean(isAdministrator.value && cleaning.value?.status === 'completed'))
const canStock = computed(() => Boolean(work.value && (isAdministrator.value || assignedToCurrent.value)))
const canManage = computed(() => isAdministrator.value)
const statusLabels = computed<Record<string, string>>(() => ({ unassigned: t('work.statusUnassigned'), assigned: t('work.statusAssigned'), in_progress: t('work.statusProgress'), completed: t('work.statusCompleted'), canceled: t('work.statusCanceled'), open: t('work.statusOpen') }))
const statusTones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = { unassigned: 'warning', assigned: 'info', in_progress: 'warning', completed: 'success', canceled: 'neutral', open: 'info' }

watch([cleaning, status], async () => {
  if (cleaning.value && (!['completed', 'canceled'].includes(cleaning.value.status) || isAdministrator.value)) {
    try { inventoryReports.value = await $fetch<InventoryItem[]>(`/api/cleanings/${id}/inventory`); inventoryLoaded.value = true } catch { inventoryReports.value = []; inventoryLoaded.value = false }
  }
}, { immediate: true })
watch(work, async value => {
  if (!value) return
  try { attachments.value = await $fetch<Array<{ id: string; fileName: string; mimeType: string }>>('/api/attachments', { query: { entityType: props.kind, entityId: id } }) } catch { attachments.value = [] }
}, { immediate: true })

onMounted(() => {
  if (route.query.finish === '1') {
    finishHint.value = t('work.finishHint')
    window.setTimeout(() => document.querySelector('.progress-section--attention')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }
})

function title() { return props.kind === 'cleaning' ? `${t('calendar.cleaning')} · ${cleaning.value?.apartment.name ?? ''}` : task.value?.title ?? t('work.tasks') }
function checklist() { return work.value?.checklist ?? [] }
function cleanerNames() { return cleaning.value?.assignments.map(item => item.cleaner.name).join(', ') || t('work.notAssigned') }
function draftBody(payload: ProgressPayload) { return { checklist: payload.checklist, comment: payload.comment, hasProblem: payload.hasProblem, problemDescription: payload.problemDescription, inventoryReports: props.kind === 'cleaning' && inventoryLoaded.value ? payload.inventoryReports : undefined } }

async function uploadPhoto(photo: File | null) {
  if (!photo) return
  const upload = new FormData()
  upload.set('entityType', props.kind)
  upload.set('entityId', id)
  upload.set('file', photo)
  await $fetch('/api/attachments', { method: 'POST', body: upload })
}
async function saveInventoryOnly(reports: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>) {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/cleanings/${id}/inventory`, { method: 'PUT', body: { reports } }); inventoryReports.value = await $fetch<InventoryItem[]>(`/api/cleanings/${id}/inventory`) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('work.saveStockError') }
  finally { pending.value = false }
}

async function saveProgress(payload: ProgressPayload, complete = false) {
  pending.value = true; error.value = ''; finishHint.value = ''
  try {
    if (!complete) await $fetch(`/api/${props.kind}s/${id}/progress`, { method: 'PUT', body: draftBody(payload) })
    else await $fetch(`/api/${props.kind}s/${id}/complete`, { method: 'POST', body: draftBody(payload) })
    try { await uploadPhoto(payload.photo); if (payload.photo) attachments.value = await $fetch<Array<{ id: string; fileName: string; mimeType: string }>>('/api/attachments', { query: { entityType: props.kind, entityId: id } }) } catch { error.value = t('work.savedPhotoError') }
    await refresh()
    if (complete && !error.value) await router.push('/work')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? (complete ? t('common.unexpectedError') : t('common.saveError'))
  } finally { pending.value = false }
}

async function quickStock() {
  if (!work.value) return
  stockItems.value = await $fetch<Array<{ consumable: { id: string; name: string; unit: string }; quantity: number }>>(`/api/inventory/${work.value.apartmentId}`)
  Object.assign(usageForm, { consumableId: '', quantity: 1, note: '' }); stockOpen.value = true
}
async function recordUsage() {
  if (!work.value) return
  pending.value = true; error.value = ''
  try { await $fetch('/api/inventory/use', { method: 'POST', body: { apartmentId: work.value.apartmentId, sourceType: props.kind, sourceId: id, ...usageForm } }); stockOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('work.writeOffError') }
  finally { pending.value = false }
}
async function removeWork() {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/${props.kind}s/${id}`, { method: 'DELETE' }); await router.push('/work') }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('work.deleteError') }
  finally { pending.value = false }
}
async function cancelTask() {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/tasks/${id}`, { method: 'PATCH', body: { status: 'canceled' } }); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('work.cancelError') }
  finally { pending.value = false }
}
function requestComplete() {
  if (!work.value) return
  const incomplete = work.value.checklist.some(item => !item.checked)
  if (incomplete) { finishHint.value = t('work.incompleteHint'); window.setTimeout(() => document.querySelector('.progress-section--attention')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); return }
  void saveProgress({ checklist: work.value.checklist, comment: work.value.comment ?? '', hasProblem: work.value.hasProblem, problemDescription: work.value.problemDescription, inventoryReports: inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: item.usedQuantity, remainingQuantity: item.remainingQuantity })), photo: null }, true)
}
</script>

<template>
  <section class="work-detail-page page-wrap max-w-4xl space-y-5">
    <UButton to="/work" color="neutral" variant="ghost" icon="i-lucide-arrow-left">{{ t('work.back') }}</UButton>
    <div v-if="status === 'pending'" class="grid gap-4"><USkeleton class="h-36 rounded-2xl" /><USkeleton class="h-64 rounded-2xl" /></div>
    <template v-else-if="work">
      <PageHeader class="work-detail-header" :title="title()">
        <template #actions><StatusBadge :label="statusLabels[work.status] ?? work.status" :tone="statusTones[work.status] ?? 'neutral'" /></template>
      </PageHeader>
      <section class="work-detail-summary surface grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
        <div><p class="detail-label">{{ t('work.date') }}</p><p class="font-semibold">{{ 'scheduledOn' in work ? formatDate(work.scheduledOn) : task?.dueOn ? formatDate(task.dueOn) : t('work.noDeadline') }}</p></div>
        <div><p class="detail-label">{{ t('work.assignee') }}</p><p class="font-semibold">{{ props.kind === 'cleaning' ? cleanerNames() : task?.assignee?.name ?? t('work.notAssigned') }}</p></div>
        <div><p class="detail-label">{{ t('work.apartment') }}</p><p class="font-semibold">{{ work.apartment.name }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot.ownerTotalEur !== undefined"><p class="detail-label">{{ t('work.cost') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.ownerTotalEur) }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot.cleanerPoolEur !== undefined"><p class="detail-label">{{ t('work.payout') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.cleanerPoolEur) }}</p></div>
      </section>
      <section v-if="attachments.length" class="surface p-5 sm:p-6"><div class="mb-3 flex items-center gap-2"><UIcon name="i-lucide-paperclip" class="size-5 text-[var(--color-primary)]" /><h2 class="font-semibold">{{ t('work.photos') }}</h2></div><div class="flex flex-wrap gap-2"><a v-for="attachment in attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}/file`" target="_blank" rel="noreferrer" class="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--color-surface-muted)] px-3 text-sm font-medium hover:bg-[var(--color-primary-soft)]"><UIcon name="i-lucide-image" class="size-4" />{{ attachment.fileName }}</a></div></section>
      <WorkProgressForm :key="work.id" :kind="props.kind" :checklist="work.checklist" :comment="work.comment" :has-problem="work.hasProblem" :problem-description="work.problemDescription" :inventory-reports="inventoryReports" :editable="canProgress" :inventory-editable="inventoryEditable" :can-complete="canComplete" :can-stock="canStock" :busy="pending" :error="error" :finish-hint="finishHint" @save="payload => saveProgress(payload)" @complete="payload => saveProgress(payload, true)" @save-inventory="saveInventoryOnly" @stock="quickStock">
        <template v-if="props.kind === 'cleaning' && canManage" #actions-left>
          <UButton color="error" variant="soft" icon="i-lucide-trash-2" :aria-label="t('work.deleteCleaning')" @click="deleteOpen = true" />
          <UButton :to="`/work?cleaningId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil" :aria-label="t('work.editCleaning')" />
        </template>
      </WorkProgressForm>
      <div v-if="canManage && (props.kind === 'task' || !canProgress)" class="work-detail-manage-actions"><UButton v-if="props.kind === 'cleaning'" :to="`/work?cleaningId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil" :aria-label="t('work.editCleaning')" /><UButton v-else :to="`/work?taskId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil">{{ t('work.editTask') }}</UButton><UButton v-if="props.kind === 'task' && !['completed', 'canceled'].includes(work.status)" color="neutral" variant="soft" icon="i-lucide-ban" @click="cancelTask">{{ t('work.cancelTask') }}</UButton><UButton v-if="isAdministrator" color="error" variant="soft" icon="i-lucide-trash-2" :aria-label="props.kind === 'cleaning' ? t('work.deleteCleaning') : undefined" @click="deleteOpen = true">{{ props.kind === 'cleaning' ? undefined : t('work.delete') }}</UButton></div>
    </template>
    <EmptyState v-else icon="i-lucide-search-x" :title="t('work.notFound')" :description="t('work.notFoundDescription')" />
    <USlideover v-model:open="stockOpen" :title="t('work.stockTitle')"><template #body><form id="work-stock-form" class="form-grid" @submit.prevent="recordUsage"><UFormField :label="t('work.consumable')"><USelect v-model="usageForm.consumableId" :items="stockItems.map(item => ({ label: `${item.consumable.name} · ${t('work.stockRemaining', { quantity: item.quantity, unit: item.consumable.unit })}`, value: item.consumable.id }))" required /></UFormField><UFormField :label="t('work.quantity')"><UInput v-model.number="usageForm.quantity" type="number" min=".001" step=".001" required /></UFormField><UFormField :label="t('work.comment')"><UInput v-model="usageForm.note" /></UFormField></form></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="stockOpen = false">{{ t('work.cancel') }}</UButton><UButton type="submit" form="work-stock-form" :loading="pending">{{ t('work.writeOff') }}</UButton></div></template></USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('work.deleteWorkTitle', { kind: props.kind === 'cleaning' ? t('work.deleteCleaning').toLocaleLowerCase() : t('work.deleteTask').toLocaleLowerCase() })" :description="t('work.deleteWorkDescription')" :loading="pending" :error="error" @confirm="removeWork" />
  </section>
</template>
