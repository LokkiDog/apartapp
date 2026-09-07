<script setup lang="ts">
import type { Cleaning } from '#fsd/entities/cleaning'
import { HotelLocationMap } from '#fsd/entities/hotel'
import type { Task } from '#fsd/entities/task'
import { useCurrentUser } from '#fsd/shared/auth'
import { formatDate, formatDateTime, formatEuro } from '#fsd/shared/lib'
import { useI18n } from 'vue-i18n'
import { ConfirmActionModal, DeleteConfirmModal, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { WorkProgressForm } from '#fsd/features/work-progress'
import { useCleaningRealtimeState } from '#fsd/shared/realtime'

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
const cleaningRealtime = useCleaningRealtimeState()
const id = String(route.params.id)
const isAdministrator = computed(() => Boolean(currentUser.value?.roles.includes('administrator')))
const isSpecialist = computed(() => Boolean(currentUser.value?.roles.includes('specialist')))
const workRequest = await useAsyncData(`work-detail-${props.kind}-${id}`, () => currentUser.value ? $fetch<Cleaning | Task>(`/api/${props.kind}s/${id}`) : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] })
const work = workRequest.data as Ref<Cleaning | Task | null>
const { status, refresh, error: workLoadError } = workRequest
const inventoryReports = ref<InventoryItem[]>([])
const inventoryLoaded = ref(false)
const attachments = ref<WorkAttachment[]>([])
const error = ref('')
const finishHint = ref('')
const pending = ref(false)
const acceptancePending = ref(false)
const startPending = ref(false)
const approvalPending = ref(false), approvalError = ref(''), approvalOpen = ref(false)
const inventoryItemToApprove = ref<InventoryItem | null>(null)
const deleteOpen = ref(false)
const cleaningProblemDeleteOpen = ref(false)
const directionsOpen = ref(false)
const coordinatesCopied = ref(false)
const coordinatesCopyError = ref('')
let coordinatesCopyTimer: number | null = null
const cameFromInventory = computed(() => props.kind === 'cleaning' && route.query.from === 'inventory')
const focusConsumableId = computed(() => typeof route.query.focusConsumableId === 'string' ? route.query.focusConsumableId : '')
const backHref = computed(() => cameFromInventory.value
  ? '/inventory'
  : props.kind === 'task' && isSpecialist.value
    ? '/tasks'
    : '/work')
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
const canAcceptCleaning = computed(() => Boolean(cleaning.value && !isSpecialist.value && ['assigned', 'in_progress'].includes(cleaning.value.status) && currentCleaningAssignment.value && !currentCleaningAssignment.value.acceptedAt))
const showCleaningAcceptance = computed(() => canAcceptCleaning.value)
const canStartCleaning = computed(() => Boolean(cleaning.value && !isSpecialist.value && cleaning.value.status === 'assigned' && (isAdministrator.value || Boolean(currentCleaningAssignment.value?.acceptedAt))))
const canProgress = computed(() => Boolean(work.value && (props.kind === 'cleaning'
  ? !isSpecialist.value && work.value.status === 'in_progress' && (isAdministrator.value || Boolean(currentCleaningAssignment.value?.acceptedAt))
  : !['completed', 'canceled'].includes(work.value.status) && (isAdministrator.value || assignedToCurrent.value))))
const canComplete = computed(() => canProgress.value)
const inventoryEditable = computed(() => Boolean(isAdministrator.value && cleaning.value?.status === 'completed'))
const canManage = computed(() => isAdministrator.value)
const canUpdateLinen = computed(() => Boolean(cleaning.value && (isAdministrator.value || isSpecialist.value || assignedToCurrent.value)))
const statusLabels = computed<Record<string, string>>(() => ({ unassigned: t('work.statusUnassigned'), assigned: t('work.statusAssigned'), in_progress: t('work.statusProgress'), completed: t('work.statusCompleted'), canceled: t('work.statusCanceled'), open: t('work.statusOpen') }))
const statusTones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = { unassigned: 'warning', assigned: 'info', in_progress: 'warning', completed: 'success', canceled: 'neutral', open: 'info' }

watch(cleaningRealtime.revision, async () => {
  if (props.kind !== 'cleaning') return
  const change = cleaningRealtime.lastChange.value
  if (change && change.cleaningId !== id) return
  if (change?.reason === 'deleted') { await navigateTo('/work'); return }
  await refresh()
  const statusCode = (workLoadError.value as { statusCode?: number; status?: number } | null)?.statusCode ?? (workLoadError.value as { status?: number } | null)?.status
  if (statusCode === 403 || statusCode === 404) await navigateTo('/work')
})

watch([cleaning, status], async () => {
  if (cleaning.value && !isSpecialist.value && (!['completed', 'canceled'].includes(cleaning.value.status) || isAdministrator.value)) {
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
async function startAssignedCleaning() {
  if (!cleaning.value) return
  startPending.value = true; error.value = ''
  try {
    await $fetch(`/api/cleanings/${id}/start`, { method: 'POST' })
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally { startPending.value = false }
}
async function updateLinen(collected: boolean) {
  if (!cleaning.value) return
  pending.value = true; error.value = ''
  try {
    await $fetch(`/api/cleanings/${id}/linen`, { method: 'PATCH', body: { collected } })
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally { pending.value = false }
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

async function removeWork(problemDisposition?: 'preserve' | 'delete') {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/${props.kind}s/${id}`, { method: 'DELETE', ...(props.kind === 'cleaning' ? { body: { problemDisposition } } : {}) }); await router.push('/work') }
  catch (cause: any) {
    if (props.kind === 'cleaning' && (cause?.statusCode === 409 || cause?.status === 409) && cause?.data?.data?.problemCount) { deleteOpen.value = false; cleaningProblemDeleteOpen.value = true; return }
    error.value = cause?.data?.statusMessage ?? t('work.deleteError')
  }
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
        <template #actions>
          <StatusBadge :label="statusLabels[work.status] ?? ''" :tone="statusTones[work.status] ?? 'neutral'" />
          <UButton v-if="showCleaningAcceptance" class="hidden sm:inline-flex" color="warning" :loading="acceptancePending" @click="acceptAssignedCleaning">{{ t('work.acceptCleaning') }}</UButton>
          <UButton v-else-if="canStartCleaning" class="hidden sm:inline-flex" icon="i-lucide-play" :loading="startPending" @click="startAssignedCleaning">{{ t('work.startCleaning') }}</UButton>
        </template>
      </PageHeader>
      <section class="work-detail-summary surface grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
        <div><p class="detail-label">{{ t('work.date') }}</p><p class="font-semibold">{{ 'scheduledOn' in work ? formatDate(work.scheduledOn) : task?.dueOn ? formatDate(task.dueOn) : t('work.noDeadline') }}</p></div>
        <div><p class="detail-label">{{ t('work.assignee') }}</p><p class="font-semibold">{{ props.kind === 'cleaning' ? cleanerNames() : task?.assignee?.name ?? t('work.notAssigned') }}</p></div>
        <div><p class="detail-label">{{ t('work.apartment') }}</p><p class="font-semibold">{{ work.apartment.name }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.startedAt"><p class="detail-label">{{ t('work.startedAt') }}</p><p class="font-semibold">{{ formatDateTime(cleaning.startedAt) }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.completedAt"><p class="detail-label">{{ t('work.completedAt') }}</p><p class="font-semibold">{{ formatDateTime(cleaning.completedAt) }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.apartment.instructions.trim()" class="col-span-2 sm:col-span-3">
          <p class="detail-label">{{ t('apartments.instructions') }}</p>
          <p class="mt-1 whitespace-pre-line break-words text-sm leading-5 text-[var(--color-muted)]">{{ cleaning.apartment.instructions }}</p>
        </div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot?.ownerTotalEur !== undefined"><p class="detail-label">{{ t('work.cost') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.ownerTotalEur) }}</p></div>
        <div v-if="props.kind === 'cleaning' && cleaning?.tariffSnapshot?.cleanerPoolEur !== undefined"><p class="detail-label">{{ t('work.payout') }}</p><p class="font-semibold tabular-nums">{{ formatEuro(cleaning.tariffSnapshot.cleanerPoolEur) }}</p></div>
        <div v-if="props.kind === 'cleaning' && hotelLocation" class="work-directions-action col-span-full"><UButton color="primary" variant="link" class="work-directions-action__button" @click="directionsOpen = true">{{ t('directions.title') }}</UButton></div>
      </section>
      <div v-if="showCleaningAcceptance || canStartCleaning" class="work-detail-mobile-cleaning-action sm:hidden">
        <UButton v-if="showCleaningAcceptance" class="min-h-11 w-full justify-center" color="warning" :loading="acceptancePending" @click="acceptAssignedCleaning">{{ t('work.acceptCleaning') }}</UButton>
        <UButton v-else class="min-h-11 w-full justify-center" icon="i-lucide-play" :loading="startPending" @click="startAssignedCleaning">{{ t('work.startCleaning') }}</UButton>
      </div>
      <WorkProgressForm :key="`${work.id}-${attachments.length}`" :kind="props.kind" :checklist="work.checklist" :comment="work.comment" :has-problem="work.hasProblem" :problem-description="work.problemDescription" :problems="cleaning?.problems ?? []" :inventory-reports="inventoryReports" :attachments="attachments" :focus-consumable-id="focusConsumableId" :editable="canProgress" :inventory-editable="inventoryEditable" :can-approve-inventory-discrepancy="inventoryEditable" :show-checklist="!isSpecialist" :show-inventory="props.kind !== 'cleaning' || !isSpecialist" :show-comment-problems="props.kind !== 'cleaning' || !isSpecialist" :can-complete="canComplete" :busy="pending" :error="error" :finish-hint="finishHint" @save="payload => saveProgress(payload)" @complete="payload => saveProgress(payload, true)" @save-inventory="saveInventoryOnly" @approve-inventory-discrepancy="requestInventoryDiscrepancyApproval">
        <template v-if="props.kind === 'cleaning' && canUpdateLinen" #after-checklist>
          <section class="progress-section">
            <UCheckbox :model-value="cleaning?.linenCollected" :label="t('work.linenCollected')" class="min-h-11 items-center font-medium" @update:model-value="updateLinen($event === true)" />
          </section>
        </template>
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
    <ConfirmActionModal v-model:open="approvalOpen" :title="t('inventoryApproval.title')" :description="t('inventoryApproval.description', { name: inventoryItemToApprove?.consumable.name ?? '', quantity: inventoryItemToApprove?.report?.remainingQuantity ?? '', unit: inventoryItemToApprove?.consumable.unit ?? '' })" :confirm-label="t('inventoryApproval.confirm')" :loading="approvalPending" :error="approvalError" @confirm="approveInventoryDiscrepancy" />
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('work.deleteWorkTitle', { kind: props.kind === 'cleaning' ? t('work.deleteCleaning').toLocaleLowerCase() : t('work.deleteTask').toLocaleLowerCase() })" :description="t('work.deleteWorkDescription')" :loading="pending" :error="error" @confirm="removeWork" />
    <UModal v-model:open="cleaningProblemDeleteOpen" :title="t('problems.cleaningDeleteTitle')"><template #body><div class="space-y-5"><p>{{ t('problems.cleaningDeleteDescription') }}</p><div class="grid gap-2"><UButton color="neutral" variant="outline" :loading="pending" @click="removeWork('preserve')">{{ t('problems.deleteCleaningKeep') }}</UButton><UButton color="error" :loading="pending" @click="removeWork('delete')">{{ t('problems.deleteCleaningWith') }}</UButton><UButton color="neutral" variant="ghost" @click="cleaningProblemDeleteOpen = false">{{ t('common.cancel') }}</UButton></div></div></template></UModal>
  </section>
</template>
