<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Cleaning } from '#fsd/entities/cleaning'
import type { Task } from '#fsd/entities/task'
import type { Apartment } from '#fsd/entities/apartment'
import { formatDate, formatEuro } from '#fsd/shared/lib'
import { useCurrentUser } from '#fsd/shared/auth'
import { DateInput, DeleteConfirmModal, EmptyState, MoneyInput, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { CleaningFormSlideover, type CleaningDraft } from '#fsd/features/manage-cleaning'
import { apartmentsForCleanings, buildCleaningPlan, localDate, routesForDay, sortRoute } from './model/work-planning'

type WorkKind = 'cleaning' | 'task'
type WorkToDelete = { kind: WorkKind; id: string; label: string }

const currentUser = useCurrentUser()
const tab = ref<'cleanings' | 'tasks'>('cleanings')
const planningMode = ref<'days' | 'cleaners' | 'apartments'>('days')
const historyOpen = ref(false)
const laterOpen = ref(false)
const collapsedFinishedDays = ref(new Set<string>())
const [{ data: cleanings, refresh: refreshCleanings }, { data: tasks, refresh: refreshTasks }, { data: apartments }, { data: stays }] = await Promise.all([
  useAsyncData('work-cleanings', () => $fetch<Cleaning[]>('/api/cleanings'), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('work-tasks', () => $fetch<Task[]>('/api/tasks'), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('work-apartments', () => currentUser.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('work-stays', () => currentUser.value ? $fetch<import('#fsd/entities/stay').Stay[]>('/api/stays') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
])
const { data: team } = await useAsyncData('work-team', () => currentUser.value?.roles.includes('administrator') ? $fetch<Array<{ id: string; name: string; roles: string[] }>>('/api/users/assignable') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })

const isAdministrator = computed(() => Boolean(currentUser.value?.roles.includes('administrator')))
const pending = ref(false)
const error = ref('')

const selected = ref<{ kind: WorkKind; id: string; checklist: Array<{ label: string; checked: boolean }> } | null>(null)
const completeOpen = computed({ get: () => Boolean(selected.value), set: value => { if (!value) selected.value = null } })
const inventoryOnly = ref(false)
type CleaningInventoryItem = { consumable: { id: string; name: string; unit: string; autoWriteOffEnabled?: boolean; autoWriteOffQuantity?: number }; quantity: number; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; remainingTouched?: boolean }
const inventoryReports = ref<CleaningInventoryItem[]>([])
const comment = ref('')
const hasProblem = ref(false)
const problemDescription = ref('')
const photo = ref<File | null>(null)

function syncExpectedRemaining(item: CleaningInventoryItem) {
  if (!item.remainingTouched) item.remainingQuantity = Math.max(0, Number(item.quantity) - (Number(item.usedQuantity) || 0))
}

const taskOpen = ref(false)
const editingTask = ref<Task | null>(null)
const taskForm = reactive({ apartmentId: '', assigneeId: 'unassigned', title: '', description: '', priority: 'normal', dueOn: '', ownerCostEur: 0 as number | null, checklist: [] as Array<{ label: string; checked: boolean }> })

const cleaningOpen = ref(false)
const editingCleaning = ref<Cleaning | null>(null)
const initialStayId = ref<string | null>(null)

const stockOpen = ref(false)
const stockWork = ref<{ kind: WorkKind; id: string; apartmentId: string } | null>(null)
const stockItems = ref<Array<{ consumable: { id: string; name: string; unit: string }; quantity: number }>>([])
const usageForm = reactive({ consumableId: '', quantity: 1, note: '' })

const deleteOpen = ref(false)
const workToDelete = ref<WorkToDelete | null>(null)
const quickCompleteOpen = ref(false)
const quickCompleteTarget = ref<{ kind: WorkKind; work: Cleaning | Task } | null>(null)

const route = useRoute()
async function openCleaningFromQuery() {
  if (!isAdministrator.value) return
  const stayId = typeof route.query.stayId === 'string' ? route.query.stayId : null
  const cleaningId = typeof route.query.cleaningId === 'string' ? route.query.cleaningId : null
  const taskId = typeof route.query.taskId === 'string' ? route.query.taskId : null
  if (cleaningId) {
    let cleaning = (cleanings.value ?? []).find(item => item.id === cleaningId)
    if (!cleaning) {
      try {
        cleaning = await $fetch<Cleaning>(`/api/cleanings/${cleaningId}`)
      } catch {
        error.value = 'Уборка не найдена или больше недоступна'
      }
    }
    if (cleaning) openEditCleaning(cleaning)
  } else if (stayId) {
    openCreateCleaning(stayId)
  } else if (taskId) {
    const task = (tasks.value ?? []).find(item => item.id === taskId)
    if (task) openEditTask(task)
  }
}
onMounted(() => { void openCleaningFromQuery() })

const cleaningPlan = computed(() => buildCleaningPlan(cleanings.value ?? []))
const today = localDate()
const cleanerPlan = computed(() => {
  const routes = new Map<string, { cleanerId: string; cleanerName: string; days: Array<{ date: string; cleanings: Cleaning[] }> }>()
  for (const day of cleaningPlan.value.days) {
    for (const route of routesForDay(day.cleanings, true)) {
      const employee = routes.get(route.cleanerId) ?? { cleanerId: route.cleanerId, cleanerName: route.cleanerName, days: [] }
      employee.days.push({ date: day.date, cleanings: route.cleanings })
      routes.set(route.cleanerId, employee)
    }
  }
  return [...routes.values()].sort((left, right) => left.cleanerName.localeCompare(right.cleanerName))
})
const apartmentPlan = computed(() => apartmentsForCleanings(cleaningPlan.value.days.flatMap(day => day.cleanings)))

const statusLabels: Record<string, string> = { unassigned: 'Без исполнителя', assigned: 'Назначено', in_progress: 'В работе', completed: 'Завершено', canceled: 'Отменено', open: 'Открыта' }
const statusTones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = { unassigned: 'warning', assigned: 'info', in_progress: 'warning', completed: 'success', canceled: 'neutral', open: 'info' }
const priorityLabels: Record<string, string> = { low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' }

function cleaningAmount(cleaning: Cleaning) { return cleaning.tariffSnapshot.ownerTotalEur ?? cleaning.tariffSnapshot.cleanerPoolEur ?? 0 }
function cleaningAmountLabel(cleaning: Cleaning) { return cleaning.tariffSnapshot.ownerTotalEur !== undefined ? 'Стоимость' : 'Общий фонд' }
function selectPhoto(event: Event) { photo.value = (event.target as HTMLInputElement).files?.[0] ?? null }
function isAssignedCleaner(cleaning: Cleaning) { return cleaning.assignments.some(item => item.cleaner.id === currentUser.value?.id) }
function isFinished(work: Cleaning | Task) { return ['completed', 'canceled'].includes(work.status) }
function isFinishedDay(date: string) { return collapsedFinishedDays.value.has(date) }
function toggleFinishedDay(date: string) {
  const next = new Set(collapsedFinishedDays.value)
  if (next.has(date)) next.delete(date)
  else next.add(date)
  collapsedFinishedDays.value = next
}
function activeRouteItems(cleanings: Cleaning[], cleanerId: string) { return sortRoute(cleanings.filter(cleaning => !isFinished(cleaning)), cleanerId) }
function routeIndex(cleanings: Cleaning[], cleanerId: string, cleaning: Cleaning) { return activeRouteItems(cleanings, cleanerId).findIndex(item => item.id === cleaning.id) }
function routeLabel(index: number) { return String(index + 1).padStart(2, '0') }
function cleanerNames(cleaning: Cleaning) { return cleaning.assignments.map(item => item.cleaner.name).join(', ') || 'Исполнитель не назначен' }
function guestCountLabel(cleaning: Cleaning) {
  const count = (cleaning.stay?.adultCount ?? 0) + (cleaning.stay?.childCount ?? 0)
  if (!cleaning.stay) return 'Без заезда'
  const mod100 = count % 100
  const mod10 = count % 10
  const word = mod100 >= 11 && mod100 <= 14 ? 'гостей' : mod10 === 1 ? 'гость' : mod10 >= 2 && mod10 <= 4 ? 'гостя' : 'гостей'
  return `${count} ${word}`
}
function cleaningSubtitle(cleaning: Cleaning) { return `${cleaning.apartment.hotel.name} · ${guestCountLabel(cleaning)}` }
function workHref(kind: WorkKind, id: string) { return `/${kind === 'cleaning' ? 'cleanings' : 'tasks'}/${encodeURIComponent(id)}` }
function openCleaningCard(event: MouseEvent, cleaning: Cleaning) {
  const target = event.target as HTMLElement
  if (target.closest('button, a, input, textarea, select')) return
  void navigateTo(workHref('cleaning', cleaning.id))
}
function openTaskCard(event: MouseEvent, task: Task) {
  const target = event.target as HTMLElement
  if (target.closest('button, a, input, textarea, select')) return
  void navigateTo(workHref('task', task.id))
}
function canOperate(kind: WorkKind, work: Cleaning | Task) {
  if (isAdministrator.value) return true
  if (kind === 'cleaning') return isAssignedCleaner(work as Cleaning)
  return (work as Task).assigneeId === currentUser.value?.id
}
function askQuickComplete(kind: WorkKind, work: Cleaning | Task) {
  if (!canOperate(kind, work) || ['completed', 'canceled'].includes(work.status)) return
  if (work.checklist.some(item => !item.checked)) { void navigateTo(`${workHref(kind, work.id)}?finish=1`); return }
  quickCompleteTarget.value = { kind, work }
  quickCompleteOpen.value = true
}
async function quickComplete() {
  const target = quickCompleteTarget.value
  if (!target) return
  pending.value = true; error.value = ''
  try {
    await $fetch(`/api/${target.kind}s/${target.work.id}/complete`, { method: 'POST', body: { checklist: target.work.checklist, comment: target.work.comment ?? '', hasProblem: target.work.hasProblem, problemDescription: target.work.problemDescription } })
    quickCompleteOpen.value = false; quickCompleteTarget.value = null
    await refreshWork()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось завершить работу' }
  finally { pending.value = false }
}

async function saveRoute(date: string, cleanerId: string, ordered: Cleaning[]) {
  if (!isAdministrator.value || !ordered.length) return
  pending.value = true
  error.value = ''
  try {
    await $fetch('/api/cleanings/routes', { method: 'PATCH', body: { cleanerId, scheduledOn: date, cleaningIds: ordered.map(cleaning => cleaning.id) } })
    await refreshCleanings()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить маршрут'
  } finally {
    pending.value = false
  }
}

function moveRouteItem(date: string, cleanerId: string, cleaning: Cleaning, direction: -1 | 1) {
  const route = activeRouteItems(cleaningPlan.value.days.find(day => day.date === date)?.cleanings ?? [], cleanerId)
  const index = route.findIndex(item => item.id === cleaning.id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= route.length) return
  const ordered = [...route]
  const [item] = ordered.splice(index, 1)
  if (!item) return
  ordered.splice(nextIndex, 0, item)
  void saveRoute(date, cleanerId, ordered)
}

function startDragging(event: DragEvent, cleaningId: string) { event.dataTransfer?.setData('text/plain', cleaningId) }
function dropRouteItem(event: DragEvent, date: string, cleanerId: string, target: Cleaning) {
  event.preventDefault()
  const sourceId = event.dataTransfer?.getData('text/plain')
  if (!sourceId || sourceId === target.id) return
  const route = activeRouteItems(cleaningPlan.value.days.find(day => day.date === date)?.cleanings ?? [], cleanerId)
  const sourceIndex = route.findIndex(item => item.id === sourceId)
  const targetIndex = route.findIndex(item => item.id === target.id)
  if (sourceIndex < 0 || targetIndex < 0) return
  const ordered = [...route]
  const [item] = ordered.splice(sourceIndex, 1)
  if (!item) return
  ordered.splice(targetIndex, 0, item)
  void saveRoute(date, cleanerId, ordered)
}

async function openComplete(kind: WorkKind, work: Cleaning | Task, onlyInventory = false) {
  selected.value = { kind, id: work.id, checklist: work.checklist.map(item => ({ ...item })) }
  inventoryOnly.value = onlyInventory
  inventoryReports.value = []
  comment.value = ''
  hasProblem.value = false
  problemDescription.value = ''
  photo.value = null
  error.value = ''
  if (kind === 'cleaning') {
    try { inventoryReports.value = (await $fetch<CleaningInventoryItem[]>(`/api/cleanings/${work.id}/inventory`)).map(item => ({ ...item, remainingTouched: false })) }
    catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось загрузить остатки' }
  }
}

async function refreshWork() { await Promise.all([refreshCleanings(), refreshTasks()]) }

async function start(kind: WorkKind, id: string) {
  error.value = ''
  try {
    await $fetch(`/api/${kind}s/${id}/start`, { method: 'POST' })
    await refreshWork()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось начать работу'
  }
}

async function complete() {
  if (!selected.value) return
  pending.value = true
  error.value = ''
  try {
    if (photo.value) {
      const upload = new FormData()
      upload.set('entityType', selected.value.kind)
      upload.set('entityId', selected.value.id)
      upload.set('file', photo.value)
      await $fetch('/api/attachments', { method: 'POST', body: upload })
    }
    await $fetch(`/api/${selected.value.kind}s/${selected.value.id}/complete`, { method: 'POST', body: { checklist: selected.value.checklist, comment: comment.value, hasProblem: hasProblem.value, problemDescription: problemDescription.value, inventoryReports: selected.value.kind === 'cleaning' ? inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: item.usedQuantity, remainingQuantity: item.remainingQuantity })) : undefined } })
    selected.value = null
    await refreshWork()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось завершить работу'
  } finally {
    pending.value = false
  }
}

async function saveInventory() {
  if (!selected.value || selected.value.kind !== 'cleaning') return
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/cleanings/${selected.value.id}/inventory`, { method: 'PUT', body: { reports: inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: item.usedQuantity, remainingQuantity: item.remainingQuantity })) } })
    inventoryReports.value = (await $fetch<CleaningInventoryItem[]>(`/api/cleanings/${selected.value.id}/inventory`)).map(item => ({ ...item, remainingTouched: false }))
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить остатки'
  } finally {
    pending.value = false
  }
}

async function cancelTask(id: string) {
  error.value = ''
  try {
    await $fetch(`/api/tasks/${id}`, { method: 'PATCH', body: { status: 'canceled' } })
    await refreshTasks()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось отменить задачу'
  }
}

function resetTaskForm() {
  Object.assign(taskForm, { apartmentId: '', assigneeId: 'unassigned', title: '', description: '', priority: 'normal', dueOn: '', ownerCostEur: 0, checklist: [] })
}

function openCreateTask() {
  editingTask.value = null
  resetTaskForm()
  error.value = ''
  taskOpen.value = true
}

function openEditTask(task: Task) {
  editingTask.value = task
  Object.assign(taskForm, {
    apartmentId: task.apartmentId,
    assigneeId: task.assigneeId ?? 'unassigned',
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueOn: task.dueOn ?? '',
    ownerCostEur: task.ownerCostEur ?? 0,
    checklist: task.checklist.map(item => ({ ...item }))
  })
  error.value = ''
  taskOpen.value = true
}

async function saveTask() {
  pending.value = true
  error.value = ''
  try {
    const { assigneeId, ...payload } = taskForm
    const body = { ...payload, ownerCostEur: payload.ownerCostEur ?? 0, assigneeId: assigneeId === 'unassigned' ? null : assigneeId, dueOn: taskForm.dueOn || null }
    if (editingTask.value) await $fetch(`/api/tasks/${editingTask.value.id}`, { method: 'PATCH', body })
    else await $fetch('/api/tasks', { method: 'POST', body })
    taskOpen.value = false
    editingTask.value = null
    await refreshTasks()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? `Не удалось ${editingTask.value ? 'изменить' : 'создать'} задачу`
  } finally {
    pending.value = false
  }
}

function openCreateCleaning(stayId: string | null = null) {
  editingCleaning.value = null
  initialStayId.value = stayId
  error.value = ''
  cleaningOpen.value = true
}
function openEditCleaning(cleaning: Cleaning) {
  editingCleaning.value = cleaning
  error.value = ''
  cleaningOpen.value = true
}

async function saveCleaning(draft: CleaningDraft) {
  pending.value = true
  error.value = ''
  try {
    await $fetch(editingCleaning.value ? `/api/cleanings/${editingCleaning.value.id}` : '/api/cleanings', { method: editingCleaning.value ? 'PATCH' : 'POST', body: { ...draft, ownerTotalEur: Number(draft.cleanerPoolEur + draft.laundryEur + draft.serviceEur) } })
    cleaningOpen.value = false
    editingCleaning.value = null
    initialStayId.value = null
    await refreshCleanings()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? `Не удалось ${editingCleaning.value ? 'изменить' : 'создать'} уборку`
  } finally {
    pending.value = false
  }
}

async function openStock(kind: WorkKind, work: Cleaning | Task) {
  stockWork.value = { kind, id: work.id, apartmentId: work.apartmentId }
  Object.assign(usageForm, { consumableId: '', quantity: 1, note: '' })
  error.value = ''
  const endpoint = `/api/inventory/${work.apartmentId}` as string
  stockItems.value = await $fetch<Array<{ consumable: { id: string; name: string; unit: string }; quantity: number }>>(endpoint)
  stockOpen.value = true
}

async function recordUsage() {
  if (!stockWork.value) return
  pending.value = true
  try {
    await $fetch('/api/inventory/use', { method: 'POST', body: { apartmentId: stockWork.value.apartmentId, sourceType: stockWork.value.kind, sourceId: stockWork.value.id, ...usageForm } })
    stockOpen.value = false
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось списать расходник'
  } finally {
    pending.value = false
  }
}

function askToDelete(kind: WorkKind, work: Cleaning | Task) {
  workToDelete.value = { kind, id: work.id, label: kind === 'task' ? (work as Task).title : `${work.apartment.name} · ${work.apartment.hotel.name}` }
  error.value = ''
  deleteOpen.value = true
}

async function removeWork() {
  if (!workToDelete.value) return
  const target = workToDelete.value
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/${target.kind}s/${target.id}`, { method: 'DELETE' })
    const kind = target.kind
    deleteOpen.value = false
    workToDelete.value = null
    if (kind === 'cleaning') await refreshCleanings()
    else await refreshTasks()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось удалить работу'
  } finally {
    pending.value = false
  }
}

function cleaningMenuItems(cleaning: Cleaning): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [{ label: 'Открыть уборку', icon: 'i-lucide-arrow-up-right', onSelect: () => { void navigateTo(workHref('cleaning', cleaning.id)) } }]
  if (isAdministrator.value && !['completed', 'canceled'].includes(cleaning.status)) items.push({ label: !cleaning.assignments.length ? 'Назначить' : 'Изменить', icon: !cleaning.assignments.length ? 'i-lucide-calendar-plus' : 'i-lucide-pencil', onSelect: () => openEditCleaning(cleaning) })
  if (isAdministrator.value) items.push({ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askToDelete('cleaning', cleaning) })
  return items
}

function taskMenuItems(task: Task): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [{ label: 'Открыть задачу', icon: 'i-lucide-arrow-up-right', onSelect: () => { void navigateTo(workHref('task', task.id)) } }]
  if (isAdministrator.value && !['completed', 'canceled'].includes(task.status)) items.push({ label: 'Отменить', icon: 'i-lucide-ban', color: 'error', onSelect: () => { void cancelTask(task.id) } })
  if (isAdministrator.value && !['completed', 'canceled'].includes(task.status)) items.push({ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => openEditTask(task) })
  if (isAdministrator.value) items.push({ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askToDelete('task', task) })
  return items
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Уборки" description="Планирование уборок и дополнительные задачи по апартаментам." />
    <UAlert v-if="error && !completeOpen && !taskOpen && !cleaningOpen && !stockOpen && !deleteOpen" color="error" variant="soft" :description="error" />
    <div class="work-tab-controls">
      <UFieldGroup class="work-tab-switch"><UButton :variant="tab === 'cleanings' ? 'solid' : 'soft'" @click="tab = 'cleanings'">Уборки <UBadge color="neutral" variant="soft">{{ cleanings?.length ?? 0 }}</UBadge></UButton><UButton :variant="tab === 'tasks' ? 'solid' : 'soft'" @click="tab = 'tasks'">Задачи <UBadge color="neutral" variant="soft">{{ tasks?.length ?? 0 }}</UBadge></UButton></UFieldGroup>
      <UButton v-if="isAdministrator" class="work-create-button" :icon="tab === 'cleanings' ? 'i-lucide-sparkles' : 'i-lucide-plus'" :aria-label="tab === 'cleanings' ? 'Новая уборка' : 'Новая задача'" @click="tab === 'cleanings' ? openCreateCleaning() : openCreateTask()"><span class="work-create-button__label">{{ tab === 'cleanings' ? 'Новая уборка' : 'Новая задача' }}</span></UButton>
    </div>

    <template v-if="tab === 'cleanings'">
      <div class="work-planning-controls">
        <UFieldGroup v-if="isAdministrator" class="work-planning-switch"><UButton :variant="planningMode === 'days' ? 'solid' : 'soft'" icon="i-lucide-calendar-days" @click="planningMode = 'days'">По дням</UButton><UButton :variant="planningMode === 'cleaners' ? 'solid' : 'soft'" icon="i-lucide-users" @click="planningMode = 'cleaners'">По исполнителям</UButton><UButton :variant="planningMode === 'apartments' ? 'solid' : 'soft'" icon="i-lucide-building-2" @click="planningMode = 'apartments'">По апартаментам</UButton></UFieldGroup>
        <UButton class="work-history-button" color="neutral" variant="ghost" icon="i-lucide-history" @click="historyOpen = !historyOpen">{{ historyOpen ? 'Скрыть историю' : 'История' }} <UBadge color="neutral" variant="soft">{{ cleaningPlan.history.length }}</UBadge></UButton>
      </div>

      <section v-if="cleaningPlan.attention.length" class="surface overflow-hidden">
        <div class="flex items-center gap-3 border-b border-[var(--color-line)] bg-amber-50/70 px-5 py-4"><UIcon name="i-lucide-calendar-clock" class="size-5 text-amber-700" /><div><h2 class="font-semibold">Требует планирования</h2><p class="text-sm text-amber-800/80">Назначьте дату и исполнителя, чтобы уборка попала в маршрут.</p></div></div>
        <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><article v-for="cleaning in cleaningPlan.attention" :key="`attention-${cleaning.id}`" class="flex items-center gap-3 py-4" @click="openCleaningCard($event, cleaning)"><div class="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-sparkles" class="size-4" /></div><div class="min-w-0 flex-1"><p class="truncate font-medium">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaningSubtitle(cleaning) }} · {{ formatDate(cleaning.scheduledOn) }} · {{ cleanerNames(cleaning) }}</p></div><StatusBadge label="Нужно назначить" tone="warning" /><UButton v-if="isAdministrator" color="primary" variant="soft" icon="i-lucide-calendar-plus" @click="openEditCleaning(cleaning)">Назначить</UButton><UDropdownMenu v-if="cleaningMenuItems(cleaning).length" :items="cleaningMenuItems(cleaning)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="Действия с уборкой" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu></article></div>
      </section>

      <template v-if="planningMode === 'days'">
        <section v-for="day in cleaningPlan.days" :key="day.date" class="surface overflow-hidden">
          <div class="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><div><h2 class="font-semibold">{{ day.date === today ? 'Сегодня' : formatDate(day.date) }}</h2><p class="text-sm text-[var(--color-muted)]">{{ day.cleanings.filter(item => !isFinished(item)).length }} активных уборок</p></div><UButton v-if="day.cleanings.some(item => isFinished(item))" color="neutral" variant="ghost" size="sm" :icon="isFinishedDay(day.date) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" @click="toggleFinishedDay(day.date)">{{ isFinishedDay(day.date) ? 'Показать завершённые' : 'Скрыть завершённые' }}</UButton></div>
          <div v-for="route in routesForDay(day.cleanings, !isFinishedDay(day.date))" :key="`${day.date}-${route.cleanerId}`" class="border-b border-[var(--color-line)] last:border-b-0"><div class="flex items-center gap-2 bg-[var(--color-surface-muted)] px-5 py-2.5 text-sm font-semibold sm:px-6"><UIcon name="i-lucide-user-round" class="size-4 text-[var(--color-primary)]" />{{ route.cleanerName }}<span class="ml-auto text-xs font-normal text-[var(--color-muted)]">{{ route.cleanings.length }} уборок</span></div><div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><article v-for="cleaning in route.cleanings" :key="`${day.date}-${route.cleanerId}-${cleaning.id}`" class="group flex items-center gap-3 py-4" :draggable="isAdministrator && !isFinished(cleaning)" @dragstart="startDragging($event, cleaning.id)" @dragover.prevent @drop="dropRouteItem($event, day.date, route.cleanerId, cleaning)" @click="openCleaningCard($event, cleaning)"><span class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]">{{ isFinished(cleaning) ? '✓' : routeLabel(routeIndex(day.cleanings, route.cleanerId, cleaning)) }}</span><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaningSubtitle(cleaning) }}</p><p v-if="cleaning.hasProblem" class="mt-1 truncate text-sm text-red-700">{{ cleaning.problemDescription }}</p></div><UButton v-if="canOperate('cleaning', cleaning) && ['assigned', 'in_progress'].includes(cleaning.status)" color="primary" variant="soft" size="sm" icon="i-lucide-circle-check" @click="askQuickComplete('cleaning', cleaning)">Завершить</UButton><StatusBadge :label="statusLabels[cleaning.status] ?? cleaning.status" :tone="statusTones[cleaning.status] ?? 'neutral'" /><div v-if="isAdministrator && !isFinished(cleaning)" class="hidden items-center gap-0.5 sm:flex"><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-up" :disabled="routeIndex(day.cleanings, route.cleanerId, cleaning) <= 0" aria-label="Поднять в маршруте" @click="moveRouteItem(day.date, route.cleanerId, cleaning, -1)" /><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-down" :disabled="routeIndex(day.cleanings, route.cleanerId, cleaning) >= activeRouteItems(day.cleanings, route.cleanerId).length - 1" aria-label="Опустить в маршруте" @click="moveRouteItem(day.date, route.cleanerId, cleaning, 1)" /></div><UDropdownMenu v-if="cleaningMenuItems(cleaning).length" :items="cleaningMenuItems(cleaning)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="Действия с уборкой" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu></article></div></div>
        </section>
      </template>

      <template v-else-if="planningMode === 'cleaners'">
        <section v-for="employee in cleanerPlan" :key="employee.cleanerId" class="surface overflow-hidden"><div class="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><div class="grid size-10 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-user-round" class="size-5" /></div><div><h2 class="font-semibold">{{ employee.cleanerName }}</h2><p class="text-sm text-[var(--color-muted)]">{{ employee.days.reduce((total, day) => total + day.cleanings.filter(item => !isFinished(item)).length, 0) }} активных уборок</p></div></div><div v-for="day in employee.days" :key="`${employee.cleanerId}-${day.date}`" class="border-b border-[var(--color-line)] last:border-b-0"><div class="bg-[var(--color-surface-muted)] px-5 py-2.5 text-sm font-semibold sm:px-6">{{ day.date === today ? 'Сегодня' : formatDate(day.date) }}</div><div class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><article v-for="cleaning in day.cleanings" :key="`${employee.cleanerId}-${day.date}-${cleaning.id}`" class="group flex items-center gap-3 py-4" :draggable="isAdministrator && !isFinished(cleaning)" @dragstart="startDragging($event, cleaning.id)" @dragover.prevent @drop="dropRouteItem($event, day.date, employee.cleanerId, cleaning)" @click="openCleaningCard($event, cleaning)"><span class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]">{{ isFinished(cleaning) ? '✓' : routeLabel(routeIndex(day.cleanings, employee.cleanerId, cleaning)) }}</span><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaningSubtitle(cleaning) }}</p></div><UButton v-if="canOperate('cleaning', cleaning) && ['assigned', 'in_progress'].includes(cleaning.status)" color="primary" variant="soft" size="sm" icon="i-lucide-circle-check" @click="askQuickComplete('cleaning', cleaning)">Завершить</UButton><StatusBadge :label="statusLabels[cleaning.status] ?? cleaning.status" :tone="statusTones[cleaning.status] ?? 'neutral'" /><div v-if="isAdministrator && !isFinished(cleaning)" class="hidden items-center gap-0.5 sm:flex"><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-up" :disabled="routeIndex(day.cleanings, employee.cleanerId, cleaning) <= 0" aria-label="Поднять в маршруте" @click="moveRouteItem(day.date, employee.cleanerId, cleaning, -1)" /><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-down" :disabled="routeIndex(day.cleanings, employee.cleanerId, cleaning) >= activeRouteItems(day.cleanings, employee.cleanerId).length - 1" aria-label="Опустить в маршруте" @click="moveRouteItem(day.date, employee.cleanerId, cleaning, 1)" /></div><UDropdownMenu v-if="cleaningMenuItems(cleaning).length" :items="cleaningMenuItems(cleaning)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="Действия с уборкой" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu></article></div></div></section>
      </template>

      <template v-else>
        <section v-for="group in apartmentPlan" :key="group.apartmentId" class="surface overflow-hidden">
          <div class="flex items-start gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
            <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-building-2" class="size-5" /></div>
            <div class="min-w-0"><h2 class="truncate font-semibold">{{ group.apartment.name }}</h2><p class="truncate text-sm text-[var(--color-muted)]">{{ group.apartment.hotel.name }} · {{ group.apartment.hotel.address }}</p></div>
          </div>
          <div v-for="day in group.days" :key="`${group.apartmentId}-${day.date}`" class="border-b border-[var(--color-line)] last:border-b-0">
            <div class="flex items-center justify-between gap-3 bg-[var(--color-surface-muted)] px-5 py-2.5 text-sm font-semibold sm:px-6"><span>{{ day.date === today ? 'Сегодня' : formatDate(day.date) }}</span><UButton v-if="day.cleanings.some(item => isFinished(item))" color="neutral" variant="ghost" size="xs" :icon="isFinishedDay(day.date) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" @click="toggleFinishedDay(day.date)">{{ isFinishedDay(day.date) ? 'Показать завершённые' : `${day.cleanings.filter(item => !isFinished(item)).length} активных` }}</UButton><span v-else class="text-xs font-normal text-[var(--color-muted)]">{{ day.cleanings.length }} уборок</span></div>
            <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
              <article v-for="cleaning in day.cleanings.filter(item => !isFinishedDay(day.date) || !isFinished(item))" @click="openCleaningCard($event, cleaning)" :key="`${group.apartmentId}-${day.date}-${cleaning.id}`" class="group flex items-center gap-3 py-4">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]">{{ isFinished(cleaning) ? '✓' : routeLabel(Math.min(...cleaning.assignments.map(item => item.routePosition))) }}</span>
                <div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleanerNames(cleaning) }} · {{ cleaningSubtitle(cleaning) }}</p><p v-if="cleaning.hasProblem" class="mt-1 truncate text-sm text-red-700">{{ cleaning.problemDescription }}</p></div>
                <StatusBadge :label="statusLabels[cleaning.status] ?? cleaning.status" :tone="statusTones[cleaning.status] ?? 'neutral'" />
                <UDropdownMenu v-if="cleaningMenuItems(cleaning).length" :items="cleaningMenuItems(cleaning)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="Действия с уборкой" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu>
              </article>
            </div>
          </div>
        </section>
      </template>

      <section v-if="cleaningPlan.later.length" class="surface overflow-hidden"><button type="button" class="flex w-full items-center justify-between px-5 py-4 text-left font-semibold sm:px-6" @click="laterOpen = !laterOpen"><span class="flex items-center gap-2"><UIcon name="i-lucide-calendar-plus" class="size-5 text-[var(--color-primary)]" />Позже <UBadge color="neutral" variant="soft">{{ cleaningPlan.later.length }}</UBadge></span><UIcon :name="laterOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-5" /></button><div v-if="laterOpen" class="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)] px-5 sm:px-6"><article v-for="cleaning in cleaningPlan.later" :key="`later-${cleaning.id}`" class="flex items-center gap-3 py-4" @click="openCleaningCard($event, cleaning)"><span class="text-sm font-medium tabular-nums text-[var(--color-muted)]">{{ formatDate(cleaning.scheduledOn) }}</span><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaningSubtitle(cleaning) }} · {{ cleanerNames(cleaning) }}</p></div><UButton v-if="canOperate('cleaning', cleaning) && ['assigned', 'in_progress'].includes(cleaning.status)" color="primary" variant="soft" size="sm" icon="i-lucide-circle-check" @click="askQuickComplete('cleaning', cleaning)">Завершить</UButton><StatusBadge :label="statusLabels[cleaning.status] ?? cleaning.status" :tone="statusTones[cleaning.status] ?? 'neutral'" /></article></div></section>

      <section v-if="historyOpen" class="surface overflow-hidden"><div class="border-b border-[var(--color-line)] px-5 py-4 sm:px-6"><h2 class="font-semibold">История уборок</h2><p class="text-sm text-[var(--color-muted)]">Завершённые и отменённые уборки прошлых дат.</p></div><div v-if="cleaningPlan.history.length" class="divide-y divide-[var(--color-line)] px-5 sm:px-6"><article v-for="cleaning in cleaningPlan.history" :key="`history-${cleaning.id}`" class="flex items-center gap-3 py-4" @click="openCleaningCard($event, cleaning)"><span class="text-sm font-medium tabular-nums text-[var(--color-muted)]">{{ formatDate(cleaning.scheduledOn) }}</span><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ cleaning.apartment.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ cleaningSubtitle(cleaning) }} · {{ cleanerNames(cleaning) }}</p></div><UButton v-if="canOperate('cleaning', cleaning) && ['assigned', 'in_progress'].includes(cleaning.status)" color="primary" variant="soft" size="sm" icon="i-lucide-circle-check" @click="askQuickComplete('cleaning', cleaning)">Завершить</UButton><StatusBadge :label="statusLabels[cleaning.status] ?? cleaning.status" :tone="statusTones[cleaning.status] ?? 'neutral'" /></article></div><p v-else class="px-5 py-6 text-sm text-[var(--color-muted)] sm:px-6">История пока пуста.</p></section>
      <EmptyState v-if="!cleanings?.length" icon="i-lucide-sparkles" title="Уборок пока нет" description="Создайте уборку вручную или назначьте её из списка заездов." />
    </template>

    <template v-if="tab === 'tasks'">
      <div v-if="tasks?.length" class="surface divide-y divide-[var(--color-line)] px-5 sm:px-6"><article v-for="task in tasks" :key="task.id" class="flex items-center gap-3 py-4" @click="openTaskCard($event, task)"><div class="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf3f7] text-[#356882]"><UIcon name="i-lucide-clipboard-check" class="size-5" /></div><div class="min-w-0 flex-1"><NuxtLink :to="workHref('task', task.id)" class="block rounded-lg p-1 -m-1 hover:bg-[var(--color-surface-muted)]"><p class="truncate font-semibold">{{ task.title }}</p><p class="mt-1 truncate text-sm text-[var(--color-muted)]">{{ task.dueOn ? `До ${formatDate(task.dueOn)}` : 'Без срока' }} · {{ task.assignee?.name ?? 'Исполнитель не назначен' }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ task.apartment.name }} · {{ task.apartment.hotel.name }}</p></NuxtLink></div><UButton v-if="canOperate('task', task) && ['open', 'in_progress'].includes(task.status)" color="primary" variant="soft" size="sm" icon="i-lucide-circle-check" @click="askQuickComplete('task', task)">Завершить</UButton><StatusBadge :label="priorityLabels[task.priority] ?? task.priority" :tone="task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warning' : 'neutral'" /><StatusBadge :label="statusLabels[task.status] ?? task.status" :tone="statusTones[task.status] ?? 'neutral'" /><UDropdownMenu v-if="taskMenuItems(task).length" :items="taskMenuItems(task)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" aria-label="Действия с задачей" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu><UAlert v-if="task.hasProblem" class="mt-3" color="error" variant="soft" icon="i-lucide-circle-alert" title="Проблема" :description="task.problemDescription" /></article></div>
      <EmptyState v-else icon="i-lucide-clipboard-check" title="Задач пока нет" description="Создайте задачу и назначьте исполнителя."><template #actions><UButton v-if="isAdministrator" @click="openCreateTask">Новая задача</UButton></template></EmptyState>
    </template>

    <USlideover v-model:open="taskOpen" :title="editingTask ? 'Изменить задачу' : 'Новая задача'"><template #body><form class="form-grid" @submit.prevent="saveTask"><UFormField label="Апартамент" :help="editingTask ? 'После начала задачи или списания расходников апартамент изменить нельзя.' : undefined"><USelect v-model="taskForm.apartmentId" :items="(apartments ?? []).map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))" class="w-full" :disabled="Boolean(editingTask && editingTask.status !== 'open')" required /></UFormField><UFormField label="Что нужно сделать"><UInput v-model="taskForm.title" required /></UFormField><UFormField label="Описание"><UTextarea v-model="taskForm.description" /></UFormField><UFormField label="Приоритет"><USelect v-model="taskForm.priority" :items="Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))" class="w-full" /></UFormField><UFormField label="Исполнитель"><USelect v-model="taskForm.assigneeId" :items="[{ label: 'Без исполнителя', value: 'unassigned' }, ...(team ?? []).filter(member => member.roles.includes('cleaner')).map(member => ({ label: member.name, value: member.id }))]" class="w-full" /></UFormField><UFormField v-if="isAdministrator" label="Стоимость управляющему"><MoneyInput v-model="taskForm.ownerCostEur" /></UFormField><UFormField label="Срок"><DateInput v-model="taskForm.dueOn" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="taskOpen = false">Отмена</UButton><UButton type="submit" :loading="pending">{{ editingTask ? 'Сохранить изменения' : 'Создать задачу' }}</UButton></div></form></template></USlideover>

    <CleaningFormSlideover v-model:open="cleaningOpen" :apartments="apartments ?? []" :stays="stays ?? []" :team="team ?? []" :editing-cleaning="editingCleaning" :initial-stay-id="initialStayId" :pending="pending" :error="error" @submit="saveCleaning" />

    <USlideover v-model:open="stockOpen" title="Списать расходник"><template #body><form class="form-grid" @submit.prevent="recordUsage"><UFormField label="Расходник"><USelect v-model="usageForm.consumableId" :items="stockItems.filter(item => item.quantity > 0).map(item => ({ label: `${item.consumable.name} · ${item.quantity} ${item.consumable.unit}`, value: item.consumable.id }))" class="w-full" required /></UFormField><UFormField label="Количество"><UInput v-model.number="usageForm.quantity" type="number" min=".001" step=".001" required /></UFormField><UFormField label="Комментарий"><UInput v-model="usageForm.note" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="stockOpen = false">Отмена</UButton><UButton type="submit" :loading="pending">Списать</UButton></div></form></template></USlideover>

    <USlideover v-model:open="completeOpen" :title="inventoryOnly ? 'Остатки расходников' : 'Завершить работу'"><template #body><form v-if="selected" class="form-grid" @submit.prevent="inventoryOnly ? saveInventory() : complete()"><section v-if="selected.kind === 'cleaning'" class="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4"><details open><summary class="cursor-pointer list-none font-semibold"><span class="flex items-center justify-between gap-3">Остатки расходников <UIcon name="i-lucide-chevron-down" class="size-4 text-[var(--color-muted)]" /></span><p class="mt-1 text-sm font-normal text-[var(--color-muted)]">Укажите расход и фактический остаток. Заполнение необязательно.</p></summary><div class="mt-4 space-y-3"><div v-for="item in inventoryReports" :key="item.consumable.id" class="rounded-xl bg-white p-3 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="font-medium">{{ item.consumable.name }}</p><p class="text-xs text-[var(--color-muted)]">Сейчас: {{ item.quantity }} {{ item.consumable.unit }}<span v-if="item.consumable.autoWriteOffEnabled"> · Авто: {{ item.consumable.autoWriteOffQuantity }} {{ item.consumable.unit }}</span></p></div><UIcon name="i-lucide-package" class="mt-0.5 size-4 text-[var(--color-primary)]" /></div><div class="mt-3 grid grid-cols-2 gap-3"><UFormField label="Израсходовано"><UInput v-model.number="item.usedQuantity" type="number" min="0" step=".001" @update:model-value="syncExpectedRemaining(item)"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField><UFormField label="Фактически осталось"><UInput v-model.number="item.remainingQuantity" type="number" min="0" step=".001" @update:model-value="item.remainingTouched = true"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField></div><p v-if="item.discrepancyQuantity" class="mt-2 text-xs text-amber-700">Есть расхождение: {{ item.discrepancyQuantity > 0 ? '+' : '' }}{{ item.discrepancyQuantity }} {{ item.consumable.unit }}</p></div><p v-if="!inventoryReports.length" class="text-sm text-[var(--color-muted)]">Для этого апартамента расходники ещё не настроены.</p><div v-if="!inventoryOnly" class="flex justify-end"><UButton type="button" color="neutral" variant="soft" size="sm" :loading="pending" @click="saveInventory">Сохранить черновик</UButton></div></div></details></section><template v-if="!inventoryOnly"><section v-if="selected.checklist.length"><p class="mb-2 font-semibold">Чек-лист</p><div class="space-y-1"><UCheckbox v-for="item in selected.checklist" :key="item.label" v-model="item.checked" :label="item.label" class="min-h-11 items-center" /></div></section><UFormField label="Комментарий" class="w-full"><UTextarea v-model="comment" class="w-full" /></UFormField><UCheckbox v-model="hasProblem" label="Есть проблема" class="min-h-11 items-center font-medium" /><UFormField v-if="hasProblem" label="Описание проблемы" class="w-full"><UTextarea v-model="problemDescription" class="w-full" required /></UFormField><UFormField label="Фото" help="Необязательно"><UInput type="file" accept="image/*" @change="selectPhoto" /></UFormField></template><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="completeOpen = false">Отмена</UButton><UButton type="submit" :loading="pending">{{ inventoryOnly ? 'Сохранить черновик' : 'Подтвердить завершение' }}</UButton></div></form></template></USlideover>

    <DeleteConfirmModal v-model:open="deleteOpen" :title="workToDelete?.kind === 'cleaning' ? 'Удалить уборку?' : 'Удалить задачу?'" :description="`«${workToDelete?.label ?? ''}» будет удалена навсегда вместе с фотографиями, финансовыми записями и складскими операциями. Списанные расходники вернутся в остатки.`" :loading="pending" :error="error" @confirm="removeWork" />
    <UModal v-model:open="quickCompleteOpen" title="Завершить работу?"><template #body><div class="space-y-5"><p>Чек-лист заполнен. После подтверждения работа перейдёт в статус «Завершено».</p><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="quickCompleteOpen = false">Отмена</UButton><UButton color="primary" :loading="pending" @click="quickComplete">Завершить</UButton></div></div></template></UModal>
  </section>
</template>
