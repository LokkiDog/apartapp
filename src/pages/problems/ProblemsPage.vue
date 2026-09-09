<script setup lang="ts">
import type { Apartment } from '#fsd/entities/apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, formatDate, formatDateTime, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { DateInput, DeleteConfirmModal, EmptyState, MoneyInput, PageHeader, PhotoFileInput, StatusBadge } from '#fsd/shared/ui'
import { problemExpenseSchema, problemInputSchema } from '@contracts/problem'
import { useI18n } from 'vue-i18n'

type Attachment = { id: string, fileName: string, mimeType: string }
type PhotoPreview = { file: File, url: string }
type Expense = { id: string, occurredOn: string, amountEur: number, description: string }
type Problem = {
  id: string
  apartmentId: string
  description: string
  details: string
  cleaningId: string | null
  createdAt: string
  resolvedAt: string | null
  resolutionComment: string
  apartment: { name: string, hotel: { name: string } }
  createdBy: { id: string, name: string } | null
  resolvedBy: { id: string, name: string } | null
  attachments: Attachment[]
  expenses: Expense[]
  totalExpenseEur: number
  sourceTaskId?: string | null
  deletionRequestedAt?: string | null
  activeSolutionTask?: { id: string, title: string, status: string, assignee?: { name: string } | null } | null
  solutionTasks?: Array<{ id: string, title: string, status: string, completedAt: string | null, assignee?: { name: string } | null }>
}

const user = useCurrentUser()
const { t } = useI18n()
const route = useRoute()
if (!user.value?.roles.includes('administrator')) await navigateTo('/')

const statusFilter = ref<'open' | 'resolved' | 'all'>('open')
const apartmentId = ref('all')
const selected = ref<Problem | null>(null)
const detailOpen = ref(false)
const formOpen = ref(false)
const resolveOpen = ref(false)
const deleteOpen = ref(false)
const expenseOpen = ref(false)
const taskOpen = ref(false)
const pending = ref(false)
const error = ref('')
const photos = ref<File[]>([])
const photoPreviews = ref<PhotoPreview[]>([])
const editExpense = ref<Expense | null>(null)
const form = reactive({ apartmentId: '', description: '', details: '' })
const expenseForm = reactive({ occurredOn: new Date().toISOString().slice(0, 10), amountEur: 0, description: '' })
const resolutionComment = ref('')
const taskDisposition = ref<'cancel' | 'delete'>('cancel')
const taskForm = reactive({ assigneeId: '', title: '', description: '', priority: 'normal', dueOn: '', ownerCostEur: 0, checklist: [] as Array<{ label: string, checked: boolean }> })
const validation = useSubmitFormValidation()
const expenseValidation = useSubmitFormValidation()
const validate = createFormValidator(problemInputSchema, t)
const validateExpense = createFormValidator(problemExpenseSchema, t)

const { data: apartments } = await useAsyncData('problems-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: team } = await useAsyncData('problems-team', () => user.value?.roles.includes('administrator') ? $fetch<Array<{ id: string, name: string, roles: string[] }>>('/api/users/assignable') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: problems, status, refresh } = await useAsyncData('problems', () => user.value?.roles.includes('administrator') ? $fetch<Problem[]>('/api/problems', { query: { status: statusFilter.value, ...(apartmentId.value === 'all' ? {} : { apartmentId: apartmentId.value }) } }) : Promise.resolve([]), { server: false, default: () => [], watch: [user, statusFilter, apartmentId] })
const apartmentOptions = computed(() => [{ label: t('problems.allApartments'), value: 'all' }, ...apartments.value.map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))])
const statusOptions = computed(() => [
  { label: t('problems.open'), value: 'open' },
  { label: t('problems.resolved'), value: 'resolved' },
  { label: t('problems.all'), value: 'all' }
])
const taskStatusLabels = computed<Record<string, string>>(() => ({
  open: t('work.statusOpen'),
  in_progress: t('work.statusProgress'),
  completed: t('work.statusCompleted'),
  canceled: t('work.statusCanceled')
}))
const selectedOpen = computed(() => Boolean(selected.value && !selected.value.resolvedAt))

function capitalizeProblemDescription(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value
}

watch(problems, async rows => {
  const problemId = typeof route.query.problemId === 'string' ? route.query.problemId : ''
  if (!problemId) return
  await openDetail(rows.find(problem => problem.id === problemId) ?? { id: problemId } as Problem)
  await navigateTo({ path: '/problems', query: { ...route.query, problemId: undefined } }, { replace: true })
}, { immediate: true })
const taskAssigneeOptions = computed(() => {
  const cleaners = (team.value ?? []).filter(member => member.roles.includes('cleaner')).map(member => ({ label: member.name, value: member.id }))
  const specialists = (team.value ?? []).filter(member => member.roles.includes('specialist') && !member.roles.includes('cleaner') && !member.roles.includes('administrator')).map(member => ({ label: member.name, value: member.id }))
  const admins = (team.value ?? []).filter(member => member.roles.includes('administrator') && !member.roles.includes('cleaner')).map(member => ({ label: member.name, value: member.id }))
  return [...(cleaners.length ? [[{ type: 'label', label: t('common.cleaners'), value: '__cleaners__' }, ...cleaners]] : []), ...(specialists.length ? [[{ type: 'label', label: t('roles.specialist'), value: '__specialists__' }, ...specialists]] : []), ...(admins.length ? [[{ type: 'label', label: t('common.administrators'), value: '__admins__' }, ...admins]] : [])]
})

function openCreate() {
  Object.assign(form, { apartmentId: apartments.value[0]?.id ?? '', description: '', details: '' })
  resetPhotos(); error.value = ''; validation.reset(); formOpen.value = true
}
async function openDetail(problem: Problem) {
  error.value = ''
  resetPhotos()
  selected.value = await $fetch<Problem>(`/api/problems/${problem.id}`)
  detailOpen.value = true
}
function openExpense(expense?: Expense) {
  editExpense.value = expense ?? null
  Object.assign(expenseForm, expense ? expense : { occurredOn: new Date().toISOString().slice(0, 10), amountEur: 0, description: '' })
  expenseValidation.reset(); error.value = ''; expenseOpen.value = true
}
async function uploadPhotos(problemId: string) {
  for (const photo of photos.value) {
    const body = new FormData(); body.set('entityType', 'cleaning_problem'); body.set('entityId', problemId); body.set('file', photo)
    await $fetch('/api/attachments', { method: 'POST', body })
  }
}
function clearPhotoPreviews() {
  if (import.meta.client) photoPreviews.value.forEach(preview => URL.revokeObjectURL(preview.url))
  photoPreviews.value = []
}
function resetPhotos() {
  clearPhotoPreviews()
  photos.value = []
}
function choosePhotos(selectedPhotos: File[]) {
  photos.value.push(...selectedPhotos)
  if (import.meta.client) photoPreviews.value.push(...selectedPhotos.map(file => ({ file, url: URL.createObjectURL(file) })))
}
async function saveProblem() {
  pending.value = true; error.value = ''
  try {
    const created = await $fetch<Problem>('/api/problems', { method: 'POST', body: form })
    await uploadPhotos(created.id)
    formOpen.value = false; resetPhotos(); await refresh(); await openDetail(created)
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function saveDescription() {
  if (!selected.value) return
  pending.value = true; error.value = ''
  try { selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}`, { method: 'PATCH', body: { description: selected.value.description, details: selected.value.details } }); await uploadPhotos(selected.value.id); selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}`); resetPhotos(); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function resolve() {
  if (!selected.value) return
  pending.value = true; error.value = ''
  try { selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}/resolve`, { method: 'POST', body: { resolutionComment: resolutionComment.value, ...(selected.value.activeSolutionTask ? { taskDisposition: taskDisposition.value } : {}) } }); resolveOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function reopen() {
  if (!selected.value) return
  pending.value = true; error.value = ''
  try { selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}/reopen`, { method: 'POST' }); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
function openTask() {
  if (!selected.value) return
  const title = capitalizeProblemDescription(selected.value.description).slice(0, 200)
  Object.assign(taskForm, { assigneeId: '', title, description: `${t('problems.card')}: /problems?problemId=${selected.value.id}`, priority: 'normal', dueOn: '', ownerCostEur: 0, checklist: [] })
  taskOpen.value = true
}
function addChecklistItem() { taskForm.checklist.push({ label: '', checked: false }) }
async function saveTask() {
  if (!selected.value || !taskForm.assigneeId) { error.value = t('common.error'); return }
  pending.value = true; error.value = ''
  try { selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}/tasks`, { method: 'POST', body: { ...taskForm, dueOn: taskForm.dueOn || null, checklist: taskForm.checklist.filter(item => item.label.trim()) } }); taskOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function decideDeletion(approved: boolean) {
  if (!selected.value) return
  pending.value = true
  try { await $fetch(`/api/problems/${selected.value.id}/deletion-request/${approved ? 'approve' : 'reject'}`, { method: 'POST' }); detailOpen.value = !approved; if (!approved) selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}`); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function saveExpense() {
  if (!selected.value) return
  pending.value = true; error.value = ''
  try {
    const url = editExpense.value ? `/api/problems/${selected.value.id}/expenses/${editExpense.value.id}` : `/api/problems/${selected.value.id}/expenses`
    selected.value = await $fetch<Problem>(url, { method: editExpense.value ? 'PATCH' : 'POST', body: expenseForm })
    expenseOpen.value = false; await refresh()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function removeExpense(expense: Expense) {
  if (!selected.value || !confirm(t('problems.deleteExpenseQuestion'))) return
  pending.value = true; error.value = ''
  try { selected.value = await $fetch<Problem>(`/api/problems/${selected.value.id}/expenses/${expense.id}`, { method: 'DELETE' }); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function removeProblem() {
  if (!selected.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/problems/${selected.value.id}`, { method: 'DELETE' as any }); deleteOpen.value = false; detailOpen.value = false; selected.value = null; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
onBeforeUnmount(resetPhotos)
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('problems.title')"><template #actions><UButton icon="i-lucide-plus" @click="openCreate">{{ t('problems.add') }}</UButton></template></PageHeader>
    <div class="surface grid gap-3 p-4 sm:grid-cols-2 sm:p-5"><UFormField :label="t('problems.status')"><USelect v-model="statusFilter" :items="statusOptions" class="w-full" /></UFormField><UFormField :label="t('expenses.apartment')"><USelect v-model="apartmentId" :items="apartmentOptions" class="w-full" /></UFormField></div>
    <div v-if="status === 'pending'" class="grid gap-2"><USkeleton v-for="item in 4" :key="item" class="h-14 rounded-2xl" /></div>
    <div v-else-if="problems.length" class="grid gap-2">
      <button v-for="problem in problems" :key="problem.id" type="button" class="surface flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color] duration-150 hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" @click="openDetail(problem)">
        <p class="min-w-0 flex-1 truncate font-semibold" style="text-align: left">{{ capitalizeProblemDescription(problem.description) }}</p>
        <div class="flex shrink-0 items-center justify-end gap-3">
          <p class="hidden min-w-0 max-w-64 truncate text-sm text-[var(--color-muted)] sm:block">{{ problem.apartment.hotel.name }} · {{ problem.apartment.name }}</p>
          <StatusBadge :label="problem.resolvedAt ? t('problems.resolved') : t('problems.open')" :tone="problem.resolvedAt ? 'success' : 'danger'" />
          <span class="hidden shrink-0 text-xs text-[var(--color-muted)] lg:inline">{{ formatDateTime(problem.resolvedAt ?? problem.createdAt) }}</span>
          <strong class="shrink-0 tabular-nums">{{ formatEuro(problem.totalExpenseEur) }}</strong>
        </div>
      </button>
    </div>
    <EmptyState v-else icon="i-lucide-circle-alert" :title="t('problems.emptyTitle')" :description="t('problems.emptyDescription')"><template #actions><UButton @click="openCreate">{{ t('problems.add') }}</UButton></template></EmptyState>

    <USlideover v-model:open="formOpen" :title="t('problems.new')"><template #body><UForm :key="validation.formKey.value" id="problem-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid" @error="validation.onError" @submit="saveProblem"><UFormField name="apartmentId" :label="t('expenses.apartment')"><USelect v-model="form.apartmentId" :items="apartmentOptions.slice(1)" class="w-full" /></UFormField><UFormField name="description" :label="t('problems.problem')" class="w-full"><UInput v-model="form.description" class="w-full" /></UFormField><UFormField name="details" :label="t('problems.description')" class="w-full"><UTextarea v-model="form.details" class="w-full" :rows="5" /></UFormField><UFormField :label="t('problems.photos')" class="w-full"><PhotoFileInput :files="photos" @select="choosePhotos" /></UFormField><div v-if="photoPreviews.length" class="grid grid-cols-2 gap-2"><figure v-for="preview in photoPreviews" :key="preview.url" class="overflow-hidden rounded-xl bg-[var(--color-surface-muted)]"><img :src="preview.url" :alt="preview.file.name" class="aspect-[2/1] w-full object-cover ring-1 ring-inset ring-black/10 dark:ring-white/10" /><figcaption class="truncate p-2 text-xs">{{ preview.file.name }}</figcaption></figure></div><UAlert v-if="error" color="error" variant="soft" :description="error" /></UForm></template><template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" @click="formOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="problem-form" :loading="pending">{{ t('common.save') }}</UButton></div></template></USlideover>

    <USlideover v-model:open="detailOpen" :title="t('problems.card')" :modal="false" :portal="false" class="problem-detail-slideover" :ui="{ overlay: 'problem-detail-overlay' }">
      <template #body>
        <div v-if="selected" class="space-y-6">
          <UAlert v-if="error" color="error" variant="soft" :description="error" />
          <UAlert v-if="selected.deletionRequestedAt" color="warning" variant="soft" title="Запрошено удаление">
            <template #actions>
              <UButton color="error" size="sm" :loading="pending" @click="decideDeletion(true)">Одобрить</UButton>
              <UButton color="neutral" size="sm" :loading="pending" @click="decideDeletion(false)">Отклонить</UButton>
            </template>
          </UAlert>

          <section class="problem-detail-section space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold">{{ selected.apartment.hotel.name }} · {{ selected.apartment.name }}</p>
                <p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('problems.createdBy', { name: selected.createdBy?.name ?? '—', date: formatDateTime(selected.createdAt) }) }}</p>
              </div>
              <StatusBadge :label="selected.resolvedAt ? t('problems.resolved') : t('problems.open')" :tone="selected.resolvedAt ? 'success' : 'danger'" />
            </div>
            <div class="space-y-3">
              <UFormField :label="t('problems.problem')"><UInput v-model="selected.description" class="w-full" :disabled="!selectedOpen" /></UFormField>
              <UFormField :label="t('problems.description')"><UTextarea v-model="selected.details" class="w-full" :rows="5" :disabled="!selectedOpen" /></UFormField>
            </div>
            <div v-if="selected.attachments.length || photoPreviews.length" class="grid grid-cols-2 gap-2">
              <a v-for="attachment in selected.attachments" :key="attachment.id" :href="`/api/attachments/${attachment.id}/file`" target="_blank" rel="noreferrer" class="overflow-hidden rounded-xl bg-[var(--color-surface-muted)]"><img :src="`/api/attachments/${attachment.id}/file?variant=card`" :alt="attachment.fileName" class="aspect-[2/1] w-full object-cover" /><span class="block truncate p-2 text-xs">{{ attachment.fileName }}</span></a>
              <figure v-for="preview in photoPreviews" :key="preview.url" class="overflow-hidden rounded-xl bg-[var(--color-surface-muted)]"><img :src="preview.url" :alt="preview.file.name" class="aspect-[2/1] w-full object-cover ring-1 ring-inset ring-black/10 dark:ring-white/10" /><figcaption class="truncate p-2 text-xs">{{ preview.file.name }}</figcaption></figure>
            </div>
            <UFormField v-if="selectedOpen" :label="t('problems.photos')"><PhotoFileInput :files="photos" @select="choosePhotos" /></UFormField>
            <div v-if="selected.cleaningId || selected.sourceTaskId" class="text-sm font-medium text-[var(--color-primary)]"><NuxtLink v-if="selected.cleaningId" :to="`/cleanings/${selected.cleaningId}`">{{ t('problems.openCleaning') }}</NuxtLink><NuxtLink v-else :to="`/tasks/${selected.sourceTaskId}`">Открыть исходную задачу</NuxtLink></div>
          </section>

          <section class="problem-detail-section space-y-2">
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-semibold">Задача по проблеме</h3>
              <UButton v-if="selectedOpen && !selected.activeSolutionTask" color="neutral" variant="soft" class="min-h-11 active:scale-[0.96] transition-transform" @click="openTask">Назначить решение</UButton>
            </div>
            <div v-if="selected.activeSolutionTask" class="flex items-center justify-between rounded-xl bg-[var(--color-surface-muted)] p-3"><NuxtLink :to="`/tasks/${selected.activeSolutionTask.id}`" class="font-medium text-[var(--color-primary)]">{{ selected.activeSolutionTask.title }}</NuxtLink><StatusBadge :label="taskStatusLabels[selected.activeSolutionTask.status] ?? selected.activeSolutionTask.status" tone="info" /></div>
            <div v-if="selected.solutionTasks?.some(task => task.status === 'completed')" class="space-y-2"><p class="text-sm font-medium text-[var(--color-muted)]">Завершённые задачи</p><NuxtLink v-for="task in selected.solutionTasks?.filter(task => task.status === 'completed')" :key="task.id" :to="`/tasks/${task.id}`" class="block text-sm text-[var(--color-primary)]">{{ task.title }}</NuxtLink></div>
          </section>

          <section class="problem-detail-section space-y-3">
            <div class="flex items-center justify-between gap-3"><h3 class="font-semibold">{{ t('problems.expenses') }}</h3><UButton v-if="selectedOpen" color="neutral" variant="soft" icon="i-lucide-plus" class="min-h-11" @click="openExpense()">{{ t('problems.addExpense') }}</UButton></div>
            <p class="text-right text-sm font-semibold">{{ t('problems.total') }}: {{ formatEuro(selected.totalExpenseEur) }}</p>
          </section>
        </div>
      </template>
      <template #footer><div v-if="selected" class="problem-detail-actions work-progress-actions work-progress-actions--in-cleaning"><div class="work-progress-actions__secondary"><UButton v-if="selectedOpen" color="error" variant="soft" icon="i-lucide-trash-2" :aria-label="t('common.delete')" @click="deleteOpen = true" /></div><div class="work-progress-actions__primary"><template v-if="selectedOpen"><UButton color="neutral" variant="soft" icon="i-lucide-save" :loading="pending" @click="saveDescription">{{ t('common.save') }}</UButton><UButton icon="i-lucide-circle-check" @click="resolveOpen = true">{{ t('problems.resolve') }}</UButton></template><template v-else><UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" :loading="pending" @click="reopen">{{ t('problems.reopen') }}</UButton></template></div></div></template>
    </USlideover>
    <USlideover v-model:open="taskOpen" title="Назначить решение"><template #body><form id="problem-task-form" class="form-grid" @submit.prevent="saveTask"><UFormField label="Исполнитель"><USelectMenu v-model="taskForm.assigneeId" :items="taskAssigneeOptions as any" value-key="value" class="w-full" /></UFormField><UFormField label="Название"><UInput v-model="taskForm.title" /></UFormField><UFormField label="Описание" class="w-full"><UTextarea v-model="taskForm.description" class="w-full" /></UFormField><UFormField label="Приоритет"><USelect v-model="taskForm.priority" :items="[{ label: 'Обычный', value: 'normal' }, { label: 'Высокий', value: 'high' }]" class="w-full" /></UFormField><UFormField label="Срок"><DateInput v-model="taskForm.dueOn" /></UFormField><UFormField label="Стоимость"><MoneyInput v-model="taskForm.ownerCostEur" /></UFormField><UFormField label="Чек-лист" class="w-full"><div class="space-y-2"><div v-for="(item, index) in taskForm.checklist" :key="index" class="flex gap-2"><UInput v-model="item.label" class="min-w-0 flex-1" /><UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="min-h-11 min-w-11" @click="taskForm.checklist.splice(index, 1)" /></div><UButton type="button" color="neutral" variant="soft" @click="addChecklistItem">Добавить пункт</UButton></div></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></form></template><template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" @click="taskOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="problem-task-form" :loading="pending">Создать задачу</UButton></div></template></USlideover>
    <USlideover v-model:open="expenseOpen" :title="editExpense ? t('problems.editExpense') : t('problems.addExpense')"><template #body><UForm :key="expenseValidation.formKey.value" id="problem-expense-form" :state="expenseForm" :validate="validateExpense" :validate-on="expenseValidation.validateOn.value" novalidate class="form-grid" @error="expenseValidation.onError" @submit="saveExpense"><UFormField name="occurredOn" :label="t('expenses.date')"><DateInput v-model="expenseForm.occurredOn" /></UFormField><UFormField name="amountEur" :label="t('expenses.amount')"><MoneyInput v-model="expenseForm.amountEur" /></UFormField><UFormField name="description" :label="t('expenses.description')" class="w-full"><UTextarea v-model="expenseForm.description" class="w-full" :rows="4" /></UFormField></UForm></template><template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" @click="expenseOpen = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="problem-expense-form" :loading="pending">{{ t('common.save') }}</UButton></div></template></USlideover>
    <UModal v-model:open="resolveOpen" :title="t('problems.resolve')"><template #body><div class="space-y-4"><UFormField :label="t('problems.resolutionComment')"><UTextarea v-model="resolutionComment" class="w-full" :rows="4" /></UFormField><UFormField v-if="selected?.activeSolutionTask" label="Связанная задача"><USelect v-model="taskDisposition" :items="[{ label: 'Отменить задачу', value: 'cancel' }, { label: 'Удалить задачу', value: 'delete' }]" class="w-full" /></UFormField><div class="form-actions"><UButton color="neutral" variant="ghost" @click="resolveOpen = false">{{ t('common.cancel') }}</UButton><UButton :loading="pending" @click="resolve">{{ t('problems.resolve') }}</UButton></div></div></template></UModal>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('problems.delete')" :description="t('problems.deleteDescription')" :loading="pending" :error="error" @confirm="removeProblem" />
  </section>
</template>
