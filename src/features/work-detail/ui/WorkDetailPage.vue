<script setup lang="ts">
import type { Cleaning } from '#fsd/entities/cleaning'
import { HotelLocationMap } from '#fsd/entities/hotel'
import type { Task } from '#fsd/entities/task'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { useI18n } from 'vue-i18n'
import { ConfirmActionModal, DeleteConfirmModal, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { WorkProgressForm } from '#fsd/features/work-progress'

type WorkKind = 'cleaning' | 'task'
type InventoryReportSource = { id: string; reportedBy: { id: string; name: string }; reportedAt: string; appliedAt: string | null; approvedAt: string | null; approvedBy: { id: string; name: string } | null; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; startingQuantity: number; expectedRemainingQuantity: number }
type InventoryItem = { consumable: { id: string; name: string; unit: string }; autoWriteOffQuantity: number | null; quantity: number; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; startingQuantity: number; expectedRemainingQuantity: number; report: InventoryReportSource | null }
type ProgressPayload = { checklist: Array<{ label: string; checked: boolean }>; comment: string; hasProblem: boolean; problemDescription: string; problems: Array<{ id: string; description: string; photos: File[] }>; inventoryReports?: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>; photos: File[] }
type WorkAttachment = { id: string; fileName: string; mimeType: string }

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
const attachments = ref<WorkAttachment[]>([])
const error = ref('')
const finishHint = ref('')
const pending = ref(false)
const acceptancePending = ref(false)
const approvalPending = ref(false), approvalError = ref(''), approvalOpen = ref(false)
const inventoryItemToApprove = ref<InventoryItem | null>(null)
const deleteOpen = ref(false)
const stockOpen = ref(false)
const directionsOpen = ref(false)
const coordinatesCopied = ref(false)
const coordinatesCopyError = ref('')
let coordinatesCopyTimer: number | null = null
const stockItems = ref<Array<{ consumable: { id: string; name: string; unit: string }; quantity: number }>>([])
const usageForm = reactive({ consumableId: '', quantity: 1, note: '' })
const cameFromInventory = computed(() => props.kind === 'cleaning' && route.query.from === 'inventory')
const focusConsumableId = computed(() => typeof route.query.focusConsumableId === 'string' ? route.query.focusConsumableId : '')
const backHref = computed(() => cameFromInventory.value ? '/inventory' : '/work')
const backLabel = computed(() => cameFromInventory.value ? t('inventoryDiscrepancy.back') : t('work.back'))

const cleaning = computed(() => props.kind === 'cleaning' ? work.value as Cleaning | null : null)
const task = computed(() => props.kind === 'task' ? work.value as Task | null : null)
const hotelLocation = computed(() => {
  const latitudeSource = work.value?.apartment.hotel.latitude
  const longitudeSource = work.value?.apartment.hotel.longitude
  if (latitudeSource === undefined || longitudeSource === undefined || latitudeSource === '' || longitudeSource === '') return null
  const latitude = Number(latitudeSource)
  const longitude = Number(longitudeSource)
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
})
const coordinatesText = computed(() => hotelLocation.value ? `${hotelLocation.value.latitude.toFixed(6)}, ${hotelLocation.value.longitude.toFixed(6)}` : '')
const currentCleaningAssignment = computed(() => cleaning.value?.assignments.find(item => item.cleanerId === currentUser.value?.id))
const assignedToCurrent = computed(() => props.kind === 'cleaning'
  ? Boolean(currentCleaningAssignment.value)
  : task.value?.assigneeId === currentUser.value?.id)
const canAcceptCleaning = computed(() => Boolean(cleaning.value && ['assigned', 'in_progress'].includes(cleaning.value.status) && currentCleaningAssignment.value && !currentCleaningAssignment.value.acceptedAt))
const showCleaningAcceptance = computed(() => canAcceptCleaning.value)
const canProgress = computed(() => Boolean(work.value && !['completed', 'canceled'].includes(work.value.status) && (isAdministrator.value || (props.kind === 'cleaning' ? Boolean(currentCleaningAssignment.value?.acceptedAt) : assignedToCurrent.value))))
const canComplete = computed(() => canProgress.value)
const inventoryEditable = computed(() => Boolean(isAdministrator.value && cleaning.value?.status === 'completed'))
const canStock = computed(() => Boolean(work.value && (isAdministrator.value || (props.kind === 'cleaning' ? Boolean(currentCleaningAssignment.value?.acceptedAt) : assignedToCurrent.value))))
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
  await refreshAttachments()
}, { immediate: true })

onMounted(() => {
  if (route.query.finish === '1') {
    finishHint.value = t('work.finishHint')
    window.setTimeout(() => document.querySelector('.progress-section--attention')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }
})
onBeforeUnmount(() => {
  if (coordinatesCopyTimer) window.clearTimeout(coordinatesCopyTimer)
})

function title() { return props.kind === 'cleaning' ? `${t('calendar.cleaning')} · ${cleaning.value?.apartment.name ?? ''}` : task.value?.title ?? t('work.tasks') }
function checklist() { return work.value?.checklist ?? [] }
function cleanerNames() { return cleaning.value?.assignments.map(item => item.cleaner.name).join(', ') || t('work.notAssigned') }
function draftBody(payload: ProgressPayload) { return { checklist: payload.checklist, comment: payload.comment, hasProblem: props.kind === 'task' ? payload.hasProblem : false, problemDescription: props.kind === 'task' ? payload.problemDescription : '', problems: props.kind === 'cleaning' ? payload.problems.map(problem => ({ id: problem.id, description: problem.description })) : [], inventoryReports: props.kind === 'cleaning' && inventoryLoaded.value ? payload.inventoryReports : undefined } }

async function refreshAttachments() {
  if (props.kind === 'cleaning') { attachments.value = []; return }
  try { attachments.value = await $fetch<WorkAttachment[]>('/api/attachments', { query: { entityType: props.kind, entityId: id } }) } catch { attachments.value = [] }
}
async function uploadProblemPhotos(problems: ProgressPayload['problems']) {
  for (const problem of problems) {
    for (const photo of problem.photos) {
      const upload = new FormData()
      upload.set('entityType', 'cleaning_problem')
      upload.set('entityId', problem.id)
      upload.set('file', photo)
      await $fetch('/api/attachments', { method: 'POST', body: upload })
    }
  }
}
async function uploadPhotos(photos: File[]) {
  for (const photo of photos) {
    const upload = new FormData()
    upload.set('entityType', props.kind)
    upload.set('entityId', id)
    upload.set('file', photo)
    await $fetch('/api/attachments', { method: 'POST', body: upload })
  }
}
async function saveInventoryOnly(reports: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>) {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/cleanings/${id}/inventory`, { method: 'PUT', body: { reports } }); inventoryReports.value = await $fetch<InventoryItem[]>(`/api/cleanings/${id}/inventory`) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('work.saveStockError') }
  finally { pending.value = false }
}
function requestInventoryDiscrepancyApproval(item: InventoryItem) {
  inventoryItemToApprove.value = item
  approvalError.value = ''
  approvalOpen.value = true
}
async function approveInventoryDiscrepancy() {
  const reportId = inventoryItemToApprove.value?.report?.id
  if (!reportId) return
  approvalPending.value = true; approvalError.value = ''
  try {
    await $fetch(`/api/inventory/discrepancies/${reportId}/approve`, { method: 'POST' })
    inventoryReports.value = await $fetch<InventoryItem[]>(`/api/cleanings/${id}/inventory`)
    approvalOpen.value = false; inventoryItemToApprove.value = null
  }
  catch (cause: any) { approvalError.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { approvalPending.value = false }
}

async function saveProgress(payload: ProgressPayload, complete = false) {
  pending.value = true; error.value = ''; finishHint.value = ''
  try {
    if (!complete) await $fetch(`/api/${props.kind}s/${id}/progress`, { method: 'PUT', body: draftBody(payload) })
    else await $fetch(`/api/${props.kind}s/${id}/complete`, { method: 'POST', body: draftBody(payload) })
    const hasPhotos = props.kind === 'cleaning' ? payload.problems.some(problem => problem.photos.length) : payload.photos.length > 0
    if (hasPhotos) {
      try { props.kind === 'cleaning' ? await uploadProblemPhotos(payload.problems) : await uploadPhotos(payload.photos) }
      catch { error.value = t('work.savedPhotoError') }
      finally { await refreshAttachments() }
    }
    await refresh()
    if (complete && !error.value) await router.push('/work')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally { pending.value = false }
}
async function acceptAssignedCleaning() {
  if (!cleaning.value) return
  acceptancePending.value = true; error.value = ''
  try {
    await $fetch(`/api/cleanings/${id}/accept`, { method: 'POST' })
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally { acceptancePending.value = false }
}

async function copyHotelCoordinates() {
  coordinatesCopyError.value = ''
  coordinatesCopied.value = false
  try {
    if (!navigator.clipboard) throw new Error('Clipboard API is unavailable')
    await navigator.clipboard.writeText(coordinatesText.value)
    coordinatesCopied.value = true
    if (coordinatesCopyTimer) window.clearTimeout(coordinatesCopyTimer)
    coordinatesCopyTimer = window.setTimeout(() => { coordinatesCopied.value = false }, 2000)
  } catch {
    coordinatesCopyError.value = t('directions.copyError')
  }
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
  void saveProgress({ checklist: work.value.checklist, comment: work.value.comment ?? '', hasProblem: work.value.hasProblem, problemDescription: work.value.problemDescription, problems: cleaning.value?.problems.map(problem => ({ id: problem.id, description: problem.description, photos: [] })) ?? [], inventoryReports: inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: item.usedQuantity, remainingQuantity: item.remainingQuantity })), photos: [] }, true)
}
</script>

<template>
  <section class="work-detail-page page-wrap max-w-4xl space-y-5">
    <UButton :to="backHref" color="neutral" variant="ghost" icon="i-lucide-arrow-left">{{ backLabel }}</UButton>
    <div v-if="status === 'pending'" class="grid gap-4"><USkeleton class="h-36 rounded-2xl" /><USkeleton class="h-64 rounded-2xl" /></div>
    <template v-else-if="work">
      <PageHeader class="work-detail-header" :title="title()">
        <template #actions><StatusBadge :label="statusLabels[work.status] ?? ''" :tone="statusTones[work.status] ?? 'neutral'" /></template>
      </PageHeader>
      <section class="work-detail-summary surface grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
        <div><p class="detail-label">{{ t('work.date') }}</p><p class="font-semibold">{{ 'scheduledOn' in work ? formatDate(work.scheduledOn) : task?.dueOn ? formatDate(task.dueOn) : t('work.noDeadline') }}</p></div>
        <div><p class="detail-label">{{ t('work.assignee') }}</p><p class="font-semibold">{{ props.kind === 'cleaning' ? cleanerNames() : task?.assignee?.name ?? t('work.notAssigned') }}</p></div>
        <div><p class="detail-label">{{ t('work.apartment') }}</p><p class="font-semibold">{{ work.apartment.name }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.apartment.instructions.trim()" class="col-span-2 sm:col-span-3">
          <p class="detail-label">{{ t('apartments.instructions') }}</p>
          <p class="mt-1 whitespace-pre-line break-words text-sm leading-5 text-[var(--color-muted)]">{{ cleaning.apartment.instructions }}</p>
        </div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot.ownerTotalEur !== undefined"><p class="detail-label">{{ t('work.cost') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.ownerTotalEur) }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot.cleanerPoolEur !== undefined"><p class="detail-label">{{ t('work.payout') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.cleanerPoolEur) }}</p></div>
        <div v-if="props.kind === 'cleaning' && hotelLocation" class="work-directions-action col-span-full"><UButton color="primary" variant="link" class="work-directions-action__button" @click="directionsOpen = true">{{ t('directions.title') }}</UButton></div>
      </section>
      <section v-if="showCleaningAcceptance" class="surface flex flex-wrap items-center justify-between gap-3 border-s-4 border-amber-600 bg-amber-50/80 p-4">
        <div><p class="font-semibold">{{ t('work.statusAwaitingAcceptance') }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('work.acceptCleaningHint') }}</p></div>
        <UButton color="warning" :loading="acceptancePending" @click="acceptAssignedCleaning">{{ t('work.acceptCleaning') }}</UButton>
      </section>
      <WorkProgressForm :key="`${work.id}-${attachments.length}`" :kind="props.kind" :checklist="work.checklist" :comment="work.comment" :has-problem="work.hasProblem" :problem-description="work.problemDescription" :problems="cleaning?.problems ?? []" :inventory-reports="inventoryReports" :attachments="attachments" :focus-consumable-id="focusConsumableId" :editable="canProgress" :inventory-editable="inventoryEditable" :can-approve-inventory-discrepancy="inventoryEditable" :can-complete="canComplete" :can-stock="canStock" :busy="pending" :error="error" :finish-hint="finishHint" @save="payload => saveProgress(payload)" @complete="payload => saveProgress(payload, true)" @save-inventory="saveInventoryOnly" @approve-inventory-discrepancy="requestInventoryDiscrepancyApproval" @stock="quickStock">
        <template v-if="props.kind === 'cleaning' && canManage" #actions-left>
          <UButton color="error" variant="soft" icon="i-lucide-trash-2" :aria-label="t('work.deleteCleaning')" @click="deleteOpen = true" />
          <UButton :to="`/work?cleaningId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil" :aria-label="t('work.editCleaning')" />
        </template>
      </WorkProgressForm>
      <div v-if="canManage && (props.kind === 'task' || !canProgress)" class="work-detail-manage-actions"><UButton v-if="props.kind === 'cleaning'" :to="`/work?cleaningId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil" :aria-label="t('work.editCleaning')" /><UButton v-else :to="`/work?taskId=${encodeURIComponent(id)}`" color="neutral" variant="soft" icon="i-lucide-pencil">{{ t('work.editTask') }}</UButton><UButton v-if="props.kind === 'task' && !['completed', 'canceled'].includes(work.status)" color="neutral" variant="soft" icon="i-lucide-ban" @click="cancelTask">{{ t('work.cancelTask') }}</UButton><UButton v-if="isAdministrator" color="error" variant="soft" icon="i-lucide-trash-2" :aria-label="props.kind === 'cleaning' ? t('work.deleteCleaning') : undefined" @click="deleteOpen = true">{{ props.kind === 'cleaning' ? undefined : t('work.delete') }}</UButton></div>
    </template>
    <EmptyState v-else icon="i-lucide-search-x" :title="t('work.notFound')" :description="t('work.notFoundDescription')" />
    <UModal v-model:open="directionsOpen" :title="t('directions.title')">
      <template #body>
        <div v-if="hotelLocation" class="space-y-5">
          <HotelLocationMap :latitude="hotelLocation.latitude" :longitude="hotelLocation.longitude" compact :label="t('directions.mapLabel')" class="overflow-hidden rounded-xl outline outline-1 outline-black/10 dark:outline-white/10" />
          <div>
            <p class="detail-label">{{ t('directions.address') }}</p>
            <p class="mt-1 text-sm font-medium leading-6">{{ work?.apartment.hotel.address }}</p>
          </div>
          <div>
            <p class="detail-label">{{ t('directions.coordinates') }}</p>
            <div class="mt-1 flex flex-col gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <code class="min-w-0 break-all font-mono text-sm tabular-nums">{{ coordinatesText }}</code>
              <UButton color="neutral" variant="soft" :icon="coordinatesCopied ? 'i-lucide-check' : 'i-lucide-copy'" class="min-h-11 shrink-0 justify-center" @click="copyHotelCoordinates">{{ coordinatesCopied ? t('directions.copied') : t('directions.copy') }}</UButton>
            </div>
          </div>
          <UAlert v-if="coordinatesCopyError" color="error" variant="soft" :description="coordinatesCopyError" />
        </div>
      </template>
    </UModal>
    <USlideover v-model:open="stockOpen" :title="t('work.stockTitle')"><template #body><form id="work-stock-form" class="form-grid" @submit.prevent="recordUsage"><UFormField :label="t('work.consumable')"><USelect v-model="usageForm.consumableId" :items="stockItems.map(item => ({ label: `${item.consumable.name} · ${t('work.stockRemaining', { quantity: item.quantity, unit: item.consumable.unit })}`, value: item.consumable.id }))" required /></UFormField><UFormField :label="t('work.quantity')"><UInput v-model.number="usageForm.quantity" type="number" min=".001" step=".001" required /></UFormField><UFormField :label="t('work.comment')"><UInput v-model="usageForm.note" /></UFormField></form></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="stockOpen = false">{{ t('work.cancel') }}</UButton><UButton type="submit" form="work-stock-form" :loading="pending">{{ t('work.writeOff') }}</UButton></div></template></USlideover>
    <ConfirmActionModal v-model:open="approvalOpen" :title="t('inventoryApproval.title')" :description="t('inventoryApproval.description', { name: inventoryItemToApprove?.consumable.name ?? '', quantity: inventoryItemToApprove?.report?.remainingQuantity ?? '', unit: inventoryItemToApprove?.consumable.unit ?? '' })" :confirm-label="t('inventoryApproval.confirm')" :loading="approvalPending" :error="approvalError" @confirm="approveInventoryDiscrepancy" />
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('work.deleteWorkTitle', { kind: props.kind === 'cleaning' ? t('work.deleteCleaning').toLocaleLowerCase() : t('work.deleteTask').toLocaleLowerCase() })" :description="t('work.deleteWorkDescription')" :loading="pending" :error="error" @confirm="removeWork" />
  </section>
</template>
