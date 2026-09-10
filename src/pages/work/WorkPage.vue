<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { LinenStatusControl, type Cleaning } from "#fsd/entities/cleaning";
import type { Task } from "#fsd/entities/task";
import type { Apartment } from "#fsd/entities/apartment";
import { ApartmentSelect } from "#fsd/features/select-apartment";
import {
  createFormValidator,
  formatDate,
  formatEuro,
  useSubmitFormValidation,
} from "#fsd/shared/lib";
import { useCurrentUser } from "#fsd/shared/auth";
import { useNotificationState } from "#fsd/features/manage-notifications";
import {
  DateInput,
  DeleteConfirmModal,
  EmptyState,
  MoneyInput,
  PageHeader,
  StatusBadge,
} from "#fsd/shared/ui";
import {
  CleaningFormSlideover,
  type CleaningDraft,
} from "#fsd/features/manage-cleaning";
import {
  apartmentsForCleanings,
  buildCleaningPlan,
  localDate,
  routesForDay,
  sortRoute,
  unacceptedCleaningsForCleaner,
} from "./model/work-planning";
import { useI18n } from "vue-i18n";
import { taskInputSchema } from "@contracts/crm";

type WorkKind = "cleaning" | "task";
type WorkToDelete = { kind: WorkKind; id: string; label: string };

const currentUser = useCurrentUser();
const notificationState = useNotificationState();
const { t } = useI18n();
const route = useRoute();
const tab = ref<"cleanings" | "tasks">(
  route.path === "/tasks" || route.query.tab === "tasks" ? "tasks" : "cleanings",
);
const planningMode = ref<"days" | "cleaners" | "apartments">("days");
const linenQueueOnly = ref(true);
const historyOpen = ref(false);
const laterOpen = ref(false);
const [
  { data: cleanings, refresh: refreshCleanings },
  { data: tasks, refresh: refreshTasks },
  { data: apartments },
  { data: stays },
] = await Promise.all([
  useAsyncData("work-cleanings", () => $fetch<Cleaning[]>("/api/cleanings"), {
    server: false,
    default: () => [],
    watch: [currentUser],
  }),
  useAsyncData("work-tasks", () => $fetch<Task[]>("/api/tasks"), {
    server: false,
    default: () => [],
    watch: [currentUser],
  }),
  useAsyncData(
    "work-apartments",
    () =>
      currentUser.value?.roles.includes("administrator")
        ? $fetch<Apartment[]>("/api/apartments")
        : Promise.resolve([]),
    { server: false, default: () => [], watch: [currentUser] },
  ),
  useAsyncData(
    "work-stays",
    () =>
      currentUser.value?.roles.includes("administrator")
        ? $fetch<import("#fsd/entities/stay").Stay[]>("/api/stays")
        : Promise.resolve([]),
    { server: false, default: () => [], watch: [currentUser] },
  ),
]);
const { data: team } = await useAsyncData(
  "work-team",
  () =>
    currentUser.value?.roles.includes("administrator")
      ? $fetch<Array<{ id: string; name: string; roles: string[] }>>(
          "/api/users/assignable",
        )
      : Promise.resolve([]),
  { server: false, default: () => [], watch: [currentUser] },
);

watch(notificationState.cleaningRevision, () => {
  if (currentUser.value) {
    void refreshCleanings();
    void refreshTasks();
  }
});

watch(notificationState.revision, () => {
  if (currentUser.value) void refreshTasks();
});

const isAdministrator = computed(() =>
  Boolean(currentUser.value?.roles.includes("administrator")),
);
const isSpecialist = computed(() =>
  Boolean(currentUser.value?.roles.includes("specialist")),
);
const pending = ref(false);
const error = ref("");

const taskOpen = ref(false);
const editingTask = ref<Task | null>(null);
const taskForm = reactive({
  apartmentId: "",
  assigneeId: "unassigned",
  title: "",
  description: "",
  priority: "normal",
  dueOn: "",
  ownerCostEur: 0 as number | null,
  checklist: [] as Array<{ label: string; checked: boolean }>,
});
const taskValidation = useSubmitFormValidation();
const taskValidationState = computed(() => ({
  ...taskForm,
  assigneeId:
    taskForm.assigneeId === "unassigned" ? null : taskForm.assigneeId,
  dueOn: taskForm.dueOn || null,
  ownerCostEur: taskForm.ownerCostEur ?? 0,
}));
const validateTask = createFormValidator(taskInputSchema, t);

const cleaningOpen = ref(false);
const editingCleaning = ref<Cleaning | null>(null);
const initialStayId = ref<string | null>(null);

const stockOpen = ref(false);
const stockWork = ref<{
  kind: WorkKind;
  id: string;
  apartmentId: string;
} | null>(null);
const stockItems = ref<
  Array<{
    consumable: { id: string; name: string; unit: string };
    quantity: number;
  }>
>([]);
const usageForm = reactive({ consumableId: "", quantity: 1, note: "" });

const deleteOpen = ref(false);
const cleaningProblemDeleteOpen = ref(false);
const workToDelete = ref<WorkToDelete | null>(null);
async function openCleaningFromQuery() {
  if (!isAdministrator.value) return;
  const stayId =
    typeof route.query.stayId === "string" ? route.query.stayId : null;
  const cleaningId =
    typeof route.query.cleaningId === "string" ? route.query.cleaningId : null;
  const taskId =
    typeof route.query.taskId === "string" ? route.query.taskId : null;
  if (cleaningId) {
    let cleaning = (cleanings.value ?? []).find(
      (item) => item.id === cleaningId,
    );
    if (!cleaning) {
      try {
        cleaning = await $fetch<Cleaning>(`/api/cleanings/${cleaningId}`);
      } catch {
        error.value = t("work.notFoundDescription");
      }
    }
    if (cleaning) openEditCleaning(cleaning);
  } else if (stayId) {
    openCreateCleaning(stayId);
  } else if (taskId) {
    const task = (tasks.value ?? []).find((item) => item.id === taskId);
    if (task) openEditTask(task);
  }
}
onMounted(() => {
  void openCleaningFromQuery();
});

const today = localDate();
const displayedCleanings = computed(() => isSpecialist.value && linenQueueOnly.value
  ? (cleanings.value ?? []).filter(canCollectLinen)
  : cleanings.value ?? []
);
const cleaningPlan = computed(() =>
  buildCleaningPlan(
    displayedCleanings.value,
    today,
    false,
    isSpecialist.value,
  ),
);
const cleanerPlan = computed(() => {
  const routes = new Map<
    string,
    {
      cleanerId: string;
      cleanerName: string;
      days: Array<{ date: string; cleanings: Cleaning[] }>;
    }
  >();
  for (const day of cleaningPlan.value.days) {
    for (const route of routesForDay(day.cleanings, true)) {
      const employee = routes.get(route.cleanerId) ?? {
        cleanerId: route.cleanerId,
        cleanerName: route.cleanerName,
        days: [],
      };
      employee.days.push({ date: day.date, cleanings: route.cleanings });
      routes.set(route.cleanerId, employee);
    }
  }
  return [...routes.values()].sort((left, right) =>
    left.cleanerName.localeCompare(right.cleanerName),
  );
});
const apartmentPlan = computed(() =>
  apartmentsForCleanings(
    cleaningPlan.value.days.flatMap((day) => day.cleanings),
  ),
);
const pendingAcceptanceCleanings = computed(() =>
  isAdministrator.value || isSpecialist.value || !currentUser.value?.id
    ? []
    : unacceptedCleaningsForCleaner(cleanings.value ?? [], currentUser.value.id),
);

const statusLabels = computed<Record<string, string>>(() => ({
  unassigned: t("work.statusUnassigned"),
  assigned: t("work.statusAssigned"),
  in_progress: t("work.statusProgress"),
  completed: t("work.statusCompleted"),
  canceled: t("work.statusCanceled"),
  open: t("work.statusOpen"),
}));
const statusTones: Record<
  string,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  unassigned: "warning",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  canceled: "neutral",
  open: "info",
};
const priorityLabels = computed<Record<string, string>>(() => ({
  low: t("work.priorityLow"),
  normal: t("work.priorityNormal"),
  high: t("work.priorityHigh"),
  urgent: t("work.priorityUrgent"),
}));

function cleaningAmount(cleaning: Cleaning) {
  return (
    cleaning.tariffSnapshot.ownerTotalEur ??
    cleaning.tariffSnapshot.cleanerPoolEur ??
    0
  );
}
function cleaningAmountLabel(cleaning: Cleaning) {
  return cleaning.tariffSnapshot.ownerTotalEur !== undefined
    ? t("work.cost")
    : t("work.pool");
}
function isAssignedCleaner(cleaning: Cleaning) {
  return cleaning.assignments.some(
    (item) => item.cleaner.id === currentUser.value?.id,
  );
}
function currentCleaningAssignment(cleaning: Cleaning) {
  return cleaning.assignments.find(item => item.cleanerId === currentUser.value?.id)
}
function canAcceptCleaning(cleaning: Cleaning) {
  return isAssignedCleaner(cleaning) && ['assigned', 'in_progress'].includes(cleaning.status) && !currentCleaningAssignment(cleaning)?.acceptedAt
}
function shouldShowCleaningStatus(cleaning: Cleaning) {
  return isAdministrator.value || !canAcceptCleaning(cleaning)
}
function awaitingCleaningAcceptance(cleaning: Cleaning) {
  return isAdministrator.value && cleaning.status === 'assigned' && cleaning.assignments.length > 0 && !cleaning.assignments.some(item => item.acceptedAt)
}
function isFinished(work: Cleaning | Task) {
  return ["completed", "canceled"].includes(work.status);
}
function activeRouteItems(cleanings: Cleaning[], cleanerId: string) {
  return sortRoute(
    cleanings.filter((cleaning) => !isFinished(cleaning)),
    cleanerId,
  );
}
function routeIndex(
  cleanings: Cleaning[],
  cleanerId: string,
  cleaning: Cleaning,
) {
  return activeRouteItems(cleanings, cleanerId).findIndex(
    (item) => item.id === cleaning.id,
  );
}
function routeLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}
function cleanerNames(cleaning: Cleaning) {
  return (
    cleaning.assignments.map((item) => item.cleaner.name).join(", ") ||
    t("work.notAssigned")
  );
}
function guestCountLabel(cleaning: Cleaning) {
  const count =
    (cleaning.stay?.adultCount ?? 0) + (cleaning.stay?.childCount ?? 0);
  if (!cleaning.stay) return t("work.noStay");
  return `${count} ${t("common.guestsPlural", count)}`;
}
function cleaningSubtitle(cleaning: Cleaning) {
  if (isSpecialist.value) return cleaning.apartment.hotel.name;
  return `${cleaning.apartment.hotel.name} · ${guestCountLabel(cleaning)}`;
}
function canCollectLinen(cleaning: Cleaning) {
  return isSpecialist.value && ['in_progress', 'completed'].includes(cleaning.status) && !cleaning.linenCollected;
}
async function toggleLinen(cleaning: Cleaning, collected: boolean) {
  pending.value = true;
  error.value = '';
  try {
    await $fetch(`/api/cleanings/${cleaning.id}/linen`, { method: 'PATCH', body: { collected } });
    await refreshCleanings();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error');
  } finally {
    pending.value = false;
  }
}
function cleaningStatusLabel(cleaning: Cleaning) {
  if (isAdministrator.value && cleaning.status === 'assigned') return awaitingCleaningAcceptance(cleaning) ? t('work.statusAwaitingAcceptance') : t('work.statusAccepted')
  return statusLabels.value[cleaning.status] ?? "";
}
async function acceptCleaning(cleaning: Cleaning) {
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/cleanings/${cleaning.id}/accept`, { method: 'POST' })
    await refreshCleanings()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
function activeCleaningCountLabel(count: number) {
  return `${count} ${t("workExtra.activeCleanings", count)}`;
}
function routesForDayView(cleanings: Cleaning[]) {
  if (isSpecialist.value)
    return [{ cleanerId: "specialist", cleanerName: "", cleanings }];
  return routesForDay(cleanings);
}
function workHref(kind: WorkKind, id: string) {
  return `/${kind === "cleaning" ? "cleanings" : "tasks"}/${encodeURIComponent(id)}`;
}
function openCleaningCard(event: MouseEvent, cleaning: Cleaning) {
  const target = event.target as HTMLElement;
  if (target.closest("button, a, input, textarea, select")) return;
  void navigateTo(workHref("cleaning", cleaning.id));
}
function openTaskCard(event: MouseEvent, task: Task) {
  const target = event.target as HTMLElement;
  if (target.closest("button, a, input, textarea, select")) return;
  void navigateTo(workHref("task", task.id));
}
async function saveRoute(date: string, cleanerId: string, ordered: Cleaning[]) {
  if (!isAdministrator.value || !ordered.length) return;
  pending.value = true;
  error.value = "";
  try {
    await $fetch("/api/cleanings/routes", {
      method: "PATCH",
      body: {
        cleanerId,
        scheduledOn: date,
        cleaningIds: ordered.map((cleaning) => cleaning.id),
      },
    });
    await refreshCleanings();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}

function moveRouteItem(
  date: string,
  cleanerId: string,
  cleaning: Cleaning,
  direction: -1 | 1,
) {
  const route = activeRouteItems(
    cleaningPlan.value.days.find((day) => day.date === date)?.cleanings ?? [],
    cleanerId,
  );
  const index = route.findIndex((item) => item.id === cleaning.id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= route.length) return;
  const ordered = [...route];
  const [item] = ordered.splice(index, 1);
  if (!item) return;
  ordered.splice(nextIndex, 0, item);
  void saveRoute(date, cleanerId, ordered);
}

function startDragging(event: DragEvent, cleaningId: string) {
  event.dataTransfer?.setData("text/plain", cleaningId);
}
function dropRouteItem(
  event: DragEvent,
  date: string,
  cleanerId: string,
  target: Cleaning,
) {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain");
  if (!sourceId || sourceId === target.id) return;
  const route = activeRouteItems(
    cleaningPlan.value.days.find((day) => day.date === date)?.cleanings ?? [],
    cleanerId,
  );
  const sourceIndex = route.findIndex((item) => item.id === sourceId);
  const targetIndex = route.findIndex((item) => item.id === target.id);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const ordered = [...route];
  const [item] = ordered.splice(sourceIndex, 1);
  if (!item) return;
  ordered.splice(targetIndex, 0, item);
  void saveRoute(date, cleanerId, ordered);
}

async function refreshWork() {
  await Promise.all([refreshCleanings(), refreshTasks()]);
}

async function start(kind: WorkKind, id: string) {
  error.value = "";
  try {
    await $fetch(`/api/${kind}s/${id}/start`, { method: "POST" });
    await refreshWork();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  }
}

async function cancelTask(id: string) {
  error.value = "";
  try {
    await $fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      body: { status: "canceled" },
    });
    await refreshTasks();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  }
}

function resetTaskForm() {
  Object.assign(taskForm, {
    apartmentId: "",
    assigneeId: "unassigned",
    title: "",
    description: "",
    priority: "normal",
    dueOn: "",
    ownerCostEur: 0,
    checklist: [],
  });
}

function openCreateTask() {
  editingTask.value = null;
  resetTaskForm();
  taskValidation.reset();
  error.value = "";
  taskOpen.value = true;
}

function openEditTask(task: Task) {
  editingTask.value = task;
  Object.assign(taskForm, {
    apartmentId: task.apartmentId,
    assigneeId: task.assigneeId ?? "unassigned",
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueOn: task.dueOn ?? "",
    ownerCostEur: task.ownerCostEur ?? 0,
    checklist: task.checklist.map((item) => ({ ...item })),
  });
  taskValidation.reset();
  error.value = "";
  taskOpen.value = true;
}

async function saveTask() {
  pending.value = true;
  error.value = "";
  try {
    const { assigneeId, ...payload } = taskForm;
    const body = {
      ...payload,
      ownerCostEur: payload.ownerCostEur ?? 0,
      assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      dueOn: taskForm.dueOn || null,
    };
    if (editingTask.value)
      await $fetch(`/api/tasks/${editingTask.value.id}`, {
        method: "PATCH",
        body,
      });
    else await $fetch("/api/tasks", { method: "POST", body });
    taskOpen.value = false;
    editingTask.value = null;
    await refreshTasks();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}

function openCreateCleaning(stayId: string | null = null) {
  editingCleaning.value = null;
  initialStayId.value = stayId;
  error.value = "";
  cleaningOpen.value = true;
}
function openEditCleaning(cleaning: Cleaning) {
  editingCleaning.value = cleaning;
  error.value = "";
  cleaningOpen.value = true;
}

async function saveCleaning(draft: CleaningDraft) {
  pending.value = true;
  error.value = "";
  try {
    await $fetch(
      editingCleaning.value
        ? `/api/cleanings/${editingCleaning.value.id}`
        : "/api/cleanings",
      {
        method: editingCleaning.value ? "PATCH" : "POST",
        body: {
          ...draft,
          ownerTotalEur: Number(
            draft.cleanerPoolEur + draft.laundryEur + draft.serviceEur,
          ),
        },
      },
    );
    cleaningOpen.value = false;
    editingCleaning.value = null;
    initialStayId.value = null;
    await refreshCleanings();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}

async function openStock(kind: WorkKind, work: Cleaning | Task) {
  stockWork.value = { kind, id: work.id, apartmentId: work.apartmentId };
  Object.assign(usageForm, { consumableId: "", quantity: 1, note: "" });
  error.value = "";
  const endpoint = `/api/inventory/${work.apartmentId}` as string;
  stockItems.value = await $fetch<
    Array<{
      consumable: { id: string; name: string; unit: string };
      quantity: number;
    }>
  >(endpoint);
  stockOpen.value = true;
}

async function recordUsage() {
  if (!stockWork.value) return;
  pending.value = true;
  try {
    await $fetch("/api/inventory/use", {
      method: "POST",
      body: {
        apartmentId: stockWork.value.apartmentId,
        sourceType: stockWork.value.kind,
        sourceId: stockWork.value.id,
        ...usageForm,
      },
    });
    stockOpen.value = false;
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}

function askToDelete(kind: WorkKind, work: Cleaning | Task) {
  workToDelete.value = {
    kind,
    id: work.id,
    label:
      kind === "task"
        ? (work as Task).title
        : `${work.apartment.name} · ${work.apartment.hotel.name}`,
  };
  error.value = "";
  deleteOpen.value = true;
}

async function removeWork(problemDisposition?: 'preserve' | 'delete') {
  if (!workToDelete.value) return;
  const target = workToDelete.value;
  pending.value = true;
  error.value = "";
  try {
    await $fetch(`/api/${target.kind}s/${target.id}`, { method: "DELETE", ...(target.kind === 'cleaning' ? { body: { problemDisposition } } : {}) });
    const kind = target.kind;
    deleteOpen.value = false;
    workToDelete.value = null;
    if (kind === "cleaning") await refreshCleanings();
    else await refreshTasks();
  } catch (cause: any) {
    if (target.kind === 'cleaning' && cause?.statusCode === 409 && cause?.data?.data?.problemCount) { deleteOpen.value = false; cleaningProblemDeleteOpen.value = true; return }
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}

function cleaningMenuItems(cleaning: Cleaning): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [
    {
      label: t("common.open"),
      onSelect: () => {
        void navigateTo(workHref("cleaning", cleaning.id));
      },
    },
  ];
  if (
    isAdministrator.value &&
    !["completed", "canceled"].includes(cleaning.status)
  )
    items.push({
      label: !cleaning.assignments.length
        ? t("common.assignCleaning")
        : t("work.editCleaning"),
      icon: !cleaning.assignments.length
        ? "i-lucide-calendar-plus"
        : "i-lucide-pencil",
      onSelect: () => openEditCleaning(cleaning),
    });
  if (isAdministrator.value)
    items.push({
      label: t("work.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => askToDelete("cleaning", cleaning),
    });
  return items;
}

function taskMenuItems(task: Task): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [
    {
      label: t("common.open"),
      onSelect: () => {
        void navigateTo(workHref("task", task.id));
      },
    },
  ];
  if (isAdministrator.value && !["completed", "canceled"].includes(task.status))
    items.push({
      label: t("work.cancelTask"),
      icon: "i-lucide-ban",
      color: "error",
      onSelect: () => {
        void cancelTask(task.id);
      },
    });
  if (isAdministrator.value && !["completed", "canceled"].includes(task.status))
    items.push({
      label: t("work.editTask"),
      icon: "i-lucide-pencil",
      onSelect: () => openEditTask(task),
    });
  if (isAdministrator.value)
    items.push({
      label: t("work.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => askToDelete("task", task),
    });
  return items;
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="tab === 'tasks' ? t('work.tasks') : t('work.cleanings')" />
    <UAlert
      v-if="
        error &&
        !taskOpen &&
        !cleaningOpen &&
        !stockOpen &&
        !deleteOpen
      "
      color="error"
      variant="soft"
      :description="error"
    />
    <div v-if="!isSpecialist" class="work-tab-controls">
      <UFieldGroup class="work-tab-switch"
        ><UButton
          :variant="tab === 'cleanings' ? 'solid' : 'soft'"
          @click="tab = 'cleanings'"
          >{{ t("work.cleanings") }}
          <UBadge color="neutral" variant="soft">{{
            cleanings?.length ?? 0
          }}</UBadge></UButton
        ><UButton
          :variant="tab === 'tasks' ? 'solid' : 'soft'"
          @click="tab = 'tasks'"
          >{{ t("work.tasks") }}
          <UBadge color="neutral" variant="soft">{{
            tasks?.length ?? 0
          }}</UBadge></UButton
        ></UFieldGroup
      >
      <UButton
        v-if="isAdministrator"
        class="work-create-button"
        :icon="tab === 'cleanings' ? 'i-lucide-broom' : 'i-lucide-plus'"
        :aria-label="
          tab === 'cleanings' ? t('work.newCleaning') : t('work.newTask')
        "
        @click="tab === 'cleanings' ? openCreateCleaning() : openCreateTask()"
        ><span class="work-create-button__label">{{
          tab === "cleanings" ? t("work.newCleaning") : t("work.newTask")
        }}</span></UButton
      >
    </div>

    <template v-if="tab === 'cleanings'">
      <div class="work-planning-controls">
        <UFieldGroup v-if="isAdministrator || isSpecialist" class="work-planning-switch" :class="{ 'work-planning-switch--two': isSpecialist }"
          ><UButton
            :variant="planningMode === 'days' ? 'solid' : 'soft'"
            icon="i-lucide-calendar-days"
            @click="planningMode = 'days'"
            >{{ t("work.days") }}</UButton
          ><UButton
            v-if="isAdministrator"
            :variant="planningMode === 'cleaners' ? 'solid' : 'soft'"
            icon="i-lucide-users"
            @click="planningMode = 'cleaners'"
            ><span class="hidden sm:inline">{{ t("work.cleaners") }}</span><span class="sm:hidden">{{ t("work.assignee") }}</span></UButton
          ><UButton
            :variant="planningMode === 'apartments' ? 'solid' : 'soft'"
            icon="i-lucide-building-2"
            @click="planningMode = 'apartments'"
            >{{ t("work.apartments") }}</UButton
          ></UFieldGroup
        >
        <div class="work-planning-actions">
          <UButton v-if="isSpecialist" class="work-linen-filter-button" color="neutral" :variant="linenQueueOnly ? 'soft' : 'ghost'" icon="i-lucide-bed" :aria-pressed="linenQueueOnly" @click="linenQueueOnly = !linenQueueOnly">{{ linenQueueOnly ? t('work.allCleanings') : t('work.linenQueue') }}</UButton>
          <UButton
            class="work-history-button"
            color="neutral"
            variant="ghost"
            icon="i-lucide-history"
            @click="historyOpen = !historyOpen"
            >{{
              historyOpen
                ? `${t("common.hide")} ${t("common.history").toLocaleLowerCase()}`
                : t("common.history")
            }}
            <UBadge color="neutral" variant="soft">{{
              cleaningPlan.history.length
            }}</UBadge></UButton
          >
        </div>
      </div>

      <div class="work-cleanings">
        <section
          v-if="pendingAcceptanceCleanings.length"
          class="work-pending-acceptance overflow-hidden rounded-xl"
        >
          <div class="px-4 pb-1 pt-3">
            <h2 class="text-sm font-semibold text-amber-950">{{ t('work.pendingAcceptanceTitle') }}</h2>
          </div>
          <div class="divide-y divide-yellow-400/70 px-4 pb-1">
            <article
              v-for="cleaning in pendingAcceptanceCleanings"
              :key="`pending-acceptance-${cleaning.id}`"
              class="work-cleaning-row flex items-center gap-2 py-2"
              @click="openCleaningCard($event, cleaning)"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ cleaning.apartment.name }}</p>
                <p class="truncate text-sm text-amber-900/75">{{ formatDate(cleaning.scheduledOn) }} · {{ cleaningSubtitle(cleaning) }}</p>
              </div>
              <UButton color="primary" variant="solid" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
            </article>
          </div>
        </section>

        <section
          v-if="cleaningPlan.attention.length"
          class="surface overflow-hidden"
        >
          <div
            class="flex items-center gap-3 border-b border-[var(--color-line)] bg-amber-50/70 px-5 py-4"
          >
            <UIcon
              name="i-lucide-calendar-clock"
              class="size-5 text-amber-700"
            />
            <div>
              <h2 class="font-semibold">{{ t("reports.attention") }}</h2>
              <p class="text-sm text-amber-800/80">
                {{ t("reports.refreshSummary") }}
              </p>
            </div>
          </div>
          <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
            <article
              v-for="cleaning in cleaningPlan.attention"
              :key="`attention-${cleaning.id}`"
              class="work-cleaning-row flex items-center gap-3"
              :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning) }"
              @click="openCleaningCard($event, cleaning)"
            >
              <div
                class="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
              >
                <UIcon name="i-lucide-broom" class="size-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  <span v-if="cleaning.isUrgent" class="work-cleaning-row__urgent-label">{{ t("work.urgentCleaning") }}</span><span v-if="cleaning.isUrgent" aria-hidden="true"> · </span>{{ cleaning.apartment.name }}
                </p>
                <p class="truncate text-sm text-[var(--color-muted)]">
                  {{ cleaningSubtitle(cleaning) }} ·
                  {{ formatDate(cleaning.scheduledOn) }} ·
                  {{ cleanerNames(cleaning) }}
                </p>
              </div>
              <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
              <span
                v-if="isSpecialist"
                class="work-cleaning-status-dot"
                :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                role="img"
                :aria-label="cleaningStatusLabel(cleaning)"
                :title="cleaningStatusLabel(cleaning)"
              />
              <StatusBadge
                v-if="!isSpecialist"
                :label="cleaningStatusLabel(cleaning)"
                tone="warning"
              /><UButton
                v-if="isAdministrator && !isFinished(cleaning)"
                color="primary"
                variant="soft"
                icon="i-lucide-calendar-plus"
                @click="openEditCleaning(cleaning)"
                >{{ t("common.assignCleaning") }}</UButton
              ><UDropdownMenu
                v-if="!isSpecialist && cleaningMenuItems(cleaning).length"
                :items="cleaningMenuItems(cleaning)"
                :content="{ align: 'end' }"
                :modal="false"
                ><UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-ellipsis-vertical"
                  :aria-label="t('work.cleanings')"
                  class="min-h-11 min-w-11 active:scale-[0.96] transition-transform"
              /></UDropdownMenu>
            </article>
          </div>
        </section>

        <template v-if="planningMode === 'days'">
          <section
            v-for="day in cleaningPlan.days"
            :key="day.date"
            class="surface overflow-hidden"
          >
            <div
              class="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6"
            >
              <div>
                <h2 class="font-semibold">
                  {{
                    day.date === today
                      ? t("common.today")
                      : formatDate(day.date)
                  }}
                </h2>
                <p class="text-sm text-[var(--color-muted)]">
                  {{ day.cleanings.filter((item) => !isFinished(item)).length }}
                  {{ t("work.cleanings").toLocaleLowerCase() }}
                </p>
              </div>
            </div>
            <div
              v-for="route in routesForDayView(day.cleanings)"
              :key="`${day.date}-${route.cleanerId}`"
              class="border-b border-[var(--color-line)] last:border-b-0"
            >
              <div
                v-if="!isSpecialist"
                class="work-group-header flex items-center gap-2 px-5 py-1 text-sm font-semibold sm:px-6"
              >
                <UIcon
                  name="i-lucide-user-round"
                  class="size-4 text-[var(--color-primary)]"
                />{{ route.cleanerName }}
              </div>
              <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
                <article
                  v-for="cleaning in route.cleanings"
                  :key="`${day.date}-${route.cleanerId}-${cleaning.id}`"
                  class="work-cleaning-row work-route-cleaning-row group items-center gap-3"
                  :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning), 'work-route-cleaning-row--specialist': isSpecialist }"
                  :draggable="isAdministrator && !isFinished(cleaning)"
                  @dragstart="startDragging($event, cleaning.id)"
                  @dragover.prevent
                  @drop="
                    dropRouteItem($event, day.date, route.cleanerId, cleaning)
                  "
                  @click="openCleaningCard($event, cleaning)"
                >
                  <span
                    v-if="!isSpecialist"
                    class="work-route-cleaning-row__position grid size-4 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]"
                    >{{
                      isFinished(cleaning)
                        ? "✓"
                        : routeLabel(
                            routeIndex(
                              day.cleanings,
                              route.cleanerId,
                              cleaning,
                            ),
                          )
                    }}</span
                  >
                  <div class="work-route-cleaning-row__content">
                    <p class="truncate font-semibold">
                      <span
                        v-if="cleaning.isUrgent"
                        role="img"
                        :aria-label="t('work.urgentCleaning')"
                        class="work-route-cleaning-row__urgent-dot"
                      ></span><span
                        v-if="cleaning.isUrgent"
                        class="work-cleaning-row__urgent-label work-route-cleaning-row__urgent-text"
                        >{{ t("work.urgentCleaning") }}</span
                      ><span
                        v-if="cleaning.isUrgent"
                        class="work-route-cleaning-row__urgent-separator"
                        aria-hidden="true"
                        > · </span
                      >{{ cleaning.apartment.name
                      }}<span
                        class="work-route-cleaning-row__mobile-hotel"
                        > · {{ cleaning.apartment.hotel.name }}</span
                      >
                    </p>
                    <p v-if="!isSpecialist" class="truncate text-sm text-[var(--color-muted)]">
                      <span class="work-route-cleaning-row__mobile-subtitle">{{ guestCountLabel(cleaning) }}</span
                      ><span class="work-route-cleaning-row__desktop-subtitle">{{ cleaningSubtitle(cleaning) }}</span>
                    </p>
                    <p v-else class="hidden truncate text-sm text-[var(--color-muted)] sm:block">
                      {{ cleaning.apartment.hotel.name }}
                    </p>
                    <p
                      v-if="cleaning.hasProblem"
                      class="mt-1 truncate text-sm text-red-700"
                    >
                      {{ cleaning.problemDescription }}
                    </p>
                  </div>
                  <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
                  <span
                    v-if="isSpecialist"
                    class="work-cleaning-status-dot"
                    :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                    role="img"
                    :aria-label="cleaningStatusLabel(cleaning)"
                    :title="cleaningStatusLabel(cleaning)"
                  />
                  <StatusBadge
                    v-if="!isSpecialist && shouldShowCleaningStatus(cleaning)"
                    :label="cleaningStatusLabel(cleaning)"
                    :tone="awaitingCleaningAcceptance(cleaning) ? 'warning' : statusTones[cleaning.status] ?? 'neutral'"
                  />
                  <UButton v-if="canAcceptCleaning(cleaning)" color="primary" variant="soft" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
                  <UDropdownMenu
                    v-if="!isSpecialist && cleaningMenuItems(cleaning).length"
                    :items="cleaningMenuItems(cleaning)"
                    :content="{ align: 'end' }"
                    :modal="false"
                    ><UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('workExtra.cleaningActions')"
                      class="min-h-11 min-w-11 active:scale-[0.96] transition-transform"
                  /></UDropdownMenu>
                  <div
                    v-if="isAdministrator"
                    class="work-route-order-controls hidden sm:flex"
                  >
                    <template v-if="!isFinished(cleaning)">
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-up"
                        class="work-route-order-button"
                        :disabled="
                          routeIndex(day.cleanings, route.cleanerId, cleaning) <=
                          0
                        "
                        :aria-label="t('workExtra.moveUp')"
                        @click="
                          moveRouteItem(day.date, route.cleanerId, cleaning, -1)
                        "
                      /><UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-down"
                        class="work-route-order-button"
                        :disabled="
                          routeIndex(day.cleanings, route.cleanerId, cleaning) >=
                          activeRouteItems(day.cleanings, route.cleanerId)
                            .length -
                            1
                        "
                        :aria-label="t('workExtra.moveDown')"
                        @click="
                          moveRouteItem(day.date, route.cleanerId, cleaning, 1)
                        "
                      />
                    </template>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </template>

        <template v-else-if="planningMode === 'cleaners'">
          <section
            v-for="employee in cleanerPlan"
            :key="employee.cleanerId"
            class="surface overflow-hidden"
          >
            <div
              class="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6"
            >
              <div
                class="grid size-10 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
              >
                <UIcon name="i-lucide-user-round" class="size-5" />
              </div>
              <div>
                <h2 class="mt-0.5 font-semibold">{{ employee.cleanerName }}</h2>
                <p class="text-sm text-[var(--color-muted)]">
                  {{
                    employee.days.reduce(
                      (total, day) =>
                        total +
                        day.cleanings.filter((item) => !isFinished(item))
                          .length,
                      0,
                    )
                  }}
                  {{ activeCleaningCountLabel(employee.days.reduce((total, day) => total + day.cleanings.filter((item) => !isFinished(item)).length, 0)) }}
                </p>
              </div>
            </div>
            <div
              v-for="day in employee.days"
              :key="`${employee.cleanerId}-${day.date}`"
              class="border-b border-[var(--color-line)] last:border-b-0"
            >
              <div
                class="work-group-header px-5 py-1 text-sm font-semibold sm:px-6"
              >
                {{
                  day.date === today ? t("common.today") : formatDate(day.date)
                }}
              </div>
              <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
                <article
                  v-for="cleaning in day.cleanings"
                  :key="`${employee.cleanerId}-${day.date}-${cleaning.id}`"
                  class="work-cleaning-row work-route-cleaning-row group items-center gap-3"
                  :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning), 'work-route-cleaning-row--specialist': isSpecialist }"
                  :draggable="isAdministrator && !isFinished(cleaning)"
                  @dragstart="startDragging($event, cleaning.id)"
                  @dragover.prevent
                  @drop="
                    dropRouteItem(
                      $event,
                      day.date,
                      employee.cleanerId,
                      cleaning,
                    )
                  "
                  @click="openCleaningCard($event, cleaning)"
                >
                  <span
                    class="work-route-cleaning-row__position grid size-4 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]"
                    >{{
                      isFinished(cleaning)
                        ? "✓"
                        : routeLabel(
                            routeIndex(
                              day.cleanings,
                              employee.cleanerId,
                              cleaning,
                            ),
                          )
                    }}</span
                  >
                  <div class="work-route-cleaning-row__content">
                    <p class="truncate font-semibold">
                      <span
                        v-if="cleaning.isUrgent"
                        role="img"
                        :aria-label="t('work.urgentCleaning')"
                        class="work-route-cleaning-row__urgent-dot"
                      ></span><span
                        v-if="cleaning.isUrgent"
                        class="work-cleaning-row__urgent-label work-route-cleaning-row__urgent-text"
                        >{{ t("work.urgentCleaning") }}</span
                      ><span
                        v-if="cleaning.isUrgent"
                        class="work-route-cleaning-row__urgent-separator"
                        aria-hidden="true"
                        > · </span
                      >{{ cleaning.apartment.name
                      }}<span
                        class="work-route-cleaning-row__mobile-hotel"
                        > · {{ cleaning.apartment.hotel.name }}</span
                      >
                    </p>
                    <p v-if="!isSpecialist" class="truncate text-sm text-[var(--color-muted)]">
                      <span class="work-route-cleaning-row__mobile-subtitle">{{ guestCountLabel(cleaning) }}</span
                      ><span class="work-route-cleaning-row__desktop-subtitle">{{ cleaningSubtitle(cleaning) }}</span>
                    </p>
                    <p v-else class="hidden truncate text-sm text-[var(--color-muted)] sm:block">
                      {{ cleaning.apartment.hotel.name }}
                    </p>
                  </div>
                  <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
                  <span
                    v-if="isSpecialist"
                    class="work-cleaning-status-dot"
                    :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                    role="img"
                    :aria-label="cleaningStatusLabel(cleaning)"
                    :title="cleaningStatusLabel(cleaning)"
                  />
                  <StatusBadge
                    v-if="!isSpecialist && shouldShowCleaningStatus(cleaning)"
                    :label="cleaningStatusLabel(cleaning)"
                    :tone="awaitingCleaningAcceptance(cleaning) ? 'warning' : statusTones[cleaning.status] ?? 'neutral'"
                  />
                  <UButton v-if="canAcceptCleaning(cleaning)" color="primary" variant="soft" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
                  <UDropdownMenu
                    v-if="!isSpecialist && cleaningMenuItems(cleaning).length"
                    :items="cleaningMenuItems(cleaning)"
                    :content="{ align: 'end' }"
                    :modal="false"
                    ><UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('workExtra.cleaningActions')"
                      class="min-h-11 min-w-11 active:scale-[0.96] transition-transform"
                  /></UDropdownMenu>
                  <div
                    v-if="isAdministrator"
                    class="work-route-order-controls hidden sm:flex"
                  >
                    <template v-if="!isFinished(cleaning)">
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-up"
                        class="work-route-order-button"
                        :disabled="
                          routeIndex(
                            day.cleanings,
                            employee.cleanerId,
                            cleaning,
                          ) <= 0
                        "
                        :aria-label="t('workExtra.moveUp')"
                        @click="
                          moveRouteItem(
                            day.date,
                            employee.cleanerId,
                            cleaning,
                            -1,
                          )
                        "
                      /><UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-chevron-down"
                        class="work-route-order-button"
                        :disabled="
                          routeIndex(
                            day.cleanings,
                            employee.cleanerId,
                            cleaning,
                          ) >=
                          activeRouteItems(day.cleanings, employee.cleanerId)
                            .length -
                            1
                        "
                        :aria-label="t('workExtra.moveDown')"
                        @click="
                          moveRouteItem(day.date, employee.cleanerId, cleaning, 1)
                        "
                      />
                    </template>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </template>

        <template v-else>
          <section
            v-for="group in apartmentPlan"
            :key="group.apartmentId"
            class="surface overflow-hidden"
          >
            <div
              class="flex items-start gap-3 border-b border-[var(--color-line)] px-5 py-4 sm:px-6"
            >
              <div
                v-if="!isSpecialist"
                class="work-apartment-header__icon grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
              >
                <UIcon name="i-lucide-building-2" class="size-5" />
              </div>
              <div class="min-w-0">
                <h2 class="truncate font-semibold">
                  {{ group.apartment.name }}
                </h2>
                <p class="truncate text-sm text-[var(--color-muted)]">
                  {{ group.apartment.hotel.name }} ·
                  {{ group.apartment.hotel.address }}
                </p>
              </div>
            </div>
            <div
              v-for="day in group.days"
              :key="`${group.apartmentId}-${day.date}`"
              class="border-b border-[var(--color-line)] last:border-b-0"
            >
              <div
                class="work-group-header flex items-center justify-between gap-3 px-5 py-1 text-sm font-semibold sm:px-6"
              >
                <span>{{
                  day.date === today ? t("common.today") : formatDate(day.date)
                }}</span>
                <span v-if="day.cleanings.some((item) => !isFinished(item))">{{ activeCleaningCountLabel(day.cleanings.filter((item) => !isFinished(item)).length) }}</span>
              </div>
              <div class="divide-y divide-[var(--color-line)] px-5 sm:px-6">
                <article
                  v-for="cleaning in day.cleanings"
                  @click="openCleaningCard($event, cleaning)"
                  :key="`${group.apartmentId}-${day.date}-${cleaning.id}`"
                  class="work-cleaning-row group flex items-center gap-3"
                  :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning) }"
                >
                  <span
                    class="work-route-cleaning-row__position grid size-4 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-xs font-semibold tabular-nums text-[var(--color-primary)]"
                    >{{
                      isFinished(cleaning)
                        ? "✓"
                        : routeLabel(
                            Math.min(
                              ...cleaning.assignments.map(
                                (item) => item.routePosition,
                              ),
                            ),
                          )
                    }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">
                      <span v-if="cleaning.isUrgent" class="work-cleaning-row__urgent-label">{{ t("work.urgentCleaning") }}</span><span v-if="cleaning.isUrgent" aria-hidden="true"> · </span>{{ cleaning.apartment.name }}
                    </p>
                    <p class="truncate text-sm text-[var(--color-muted)]">
                      {{ cleanerNames(cleaning) }} ·
                      {{ cleaningSubtitle(cleaning) }}
                    </p>
                    <p
                      v-if="cleaning.hasProblem"
                      class="mt-1 truncate text-sm text-red-700"
                    >
                      {{ cleaning.problemDescription }}
                    </p>
                  </div>
                  <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
                  <span
                    v-if="isSpecialist"
                    class="work-cleaning-status-dot"
                    :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                    role="img"
                    :aria-label="cleaningStatusLabel(cleaning)"
                    :title="cleaningStatusLabel(cleaning)"
                  />
                  <StatusBadge
                    v-if="!isSpecialist && shouldShowCleaningStatus(cleaning)"
                    :label="cleaningStatusLabel(cleaning)"
                    :tone="awaitingCleaningAcceptance(cleaning) ? 'warning' : statusTones[cleaning.status] ?? 'neutral'"
                  />
                  <UButton v-if="canAcceptCleaning(cleaning)" color="primary" variant="soft" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
                  <UDropdownMenu
                    v-if="!isSpecialist && cleaningMenuItems(cleaning).length"
                    :items="cleaningMenuItems(cleaning)"
                    :content="{ align: 'end' }"
                    :modal="false"
                    ><UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="t('workExtra.cleaningActions')"
                      class="min-h-11 min-w-11 active:scale-[0.96] transition-transform"
                  /></UDropdownMenu>
                </article>
              </div>
            </div>
          </section>
        </template>

        <section
          v-if="cleaningPlan.later.length"
          class="surface overflow-hidden"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between px-5 py-4 text-left font-semibold sm:px-6"
            @click="laterOpen = !laterOpen"
          >
            <span class="flex items-center gap-2"
              ><UIcon
                name="i-lucide-calendar-plus"
                class="size-5 text-[var(--color-primary)]"
              />{{ t("workExtra.later") }}
              <UBadge color="neutral" variant="soft">{{
                cleaningPlan.later.length
              }}</UBadge></span
            ><UIcon
              :name="
                laterOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
              "
              class="size-5"
            />
          </button>
          <div
            v-if="laterOpen"
            class="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)] px-5 sm:px-6"
          >
            <article
              v-for="cleaning in cleaningPlan.later"
              :key="`later-${cleaning.id}`"
              class="work-cleaning-row flex items-center gap-3"
              :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning) }"
              @click="openCleaningCard($event, cleaning)"
            >
              <span
                class="text-sm font-medium tabular-nums text-[var(--color-muted)]"
                >{{ formatDate(cleaning.scheduledOn) }}</span
              >
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">
                  <span v-if="cleaning.isUrgent" class="work-cleaning-row__urgent-label">{{ t("work.urgentCleaning") }}</span><span v-if="cleaning.isUrgent" aria-hidden="true"> · </span>{{ cleaning.apartment.name }}
                </p>
                <p class="truncate text-sm text-[var(--color-muted)]">
                  {{ cleaningSubtitle(cleaning) }} ·
                  {{ cleanerNames(cleaning) }}
                </p>
              </div>
              <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
              <span
                v-if="isSpecialist"
                class="work-cleaning-status-dot"
                :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                role="img"
                :aria-label="cleaningStatusLabel(cleaning)"
                :title="cleaningStatusLabel(cleaning)"
              />
              <StatusBadge
                v-if="!isSpecialist && shouldShowCleaningStatus(cleaning)"
                :label="cleaningStatusLabel(cleaning)"
                :tone="awaitingCleaningAcceptance(cleaning) ? 'warning' : statusTones[cleaning.status] ?? 'neutral'"
              />
              <UButton v-if="canAcceptCleaning(cleaning)" color="primary" variant="soft" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
            </article>
          </div>
        </section>

        <section v-if="historyOpen" class="surface overflow-hidden">
          <div class="border-b border-[var(--color-line)] px-5 py-4 sm:px-6">
            <h2 class="font-semibold">{{ t("workExtra.historyTitle") }}</h2>
          </div>
          <div
            v-if="cleaningPlan.history.length"
            class="divide-y divide-[var(--color-line)] px-5 sm:px-6"
          >
            <article
              v-for="cleaning in cleaningPlan.history"
              :key="`history-${cleaning.id}`"
              class="work-cleaning-row flex items-center gap-3"
              :class="{ 'work-cleaning-row--urgent': cleaning.isUrgent, 'work-cleaning-row--awaiting-acceptance': awaitingCleaningAcceptance(cleaning) }"
              @click="openCleaningCard($event, cleaning)"
            >
              <span
                class="text-sm font-medium tabular-nums text-[var(--color-muted)]"
                >{{ formatDate(cleaning.scheduledOn) }}</span
              >
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">
                  <span v-if="cleaning.isUrgent" class="work-cleaning-row__urgent-label">{{ t("work.urgentCleaning") }}</span><span v-if="cleaning.isUrgent" aria-hidden="true"> · </span>{{ cleaning.apartment.name }}
                </p>
                <p class="truncate text-sm text-[var(--color-muted)]">
                  {{ cleaningSubtitle(cleaning) }} ·
                  {{ cleanerNames(cleaning) }}
                </p>
              </div>
              <span class="work-cleaning-row__linen"><LinenStatusControl v-if="isAdministrator || isSpecialist" :started-at="cleaning.startedAt" :collected="cleaning.linenCollected" :editable="canCollectLinen(cleaning)" @toggle="toggleLinen(cleaning, $event)" /></span>
              <span
                v-if="isSpecialist"
                class="work-cleaning-status-dot"
                :data-tone="statusTones[cleaning.status] ?? 'neutral'"
                role="img"
                :aria-label="cleaningStatusLabel(cleaning)"
                :title="cleaningStatusLabel(cleaning)"
              />
              <StatusBadge
                v-if="!isSpecialist && shouldShowCleaningStatus(cleaning)"
                :label="cleaningStatusLabel(cleaning)"
                :tone="awaitingCleaningAcceptance(cleaning) ? 'warning' : statusTones[cleaning.status] ?? 'neutral'"
              />
              <UButton v-if="canAcceptCleaning(cleaning)" color="primary" variant="soft" size="xs" class="h-6 min-h-6 px-2" :loading="pending" @click.stop="acceptCleaning(cleaning)">{{ t('work.accept') }}</UButton>
            </article>
          </div>
          <p v-else class="px-5 py-6 text-sm text-[var(--color-muted)] sm:px-6">
            {{ t("workExtra.historyEmpty") }}
          </p>
        </section>
        <EmptyState
          v-if="!cleanings?.length"
          icon="i-lucide-broom"
          :title="t('workExtra.noCleanings')"
          :description="t('workExtra.noCleaningsDescription')"
        />
      </div>
    </template>

    <template v-if="tab === 'tasks'">
      <div
        v-if="tasks?.length"
        class="surface divide-y divide-[var(--color-line)] px-5 sm:px-6"
      >
        <article
          v-for="task in tasks"
          :key="task.id"
          class="work-task-row group items-center gap-3"
          @click="openTaskCard($event, task)"
        >
          <div
            class="work-task-row__icon grid shrink-0 place-items-center bg-[#edf3f7] text-[#356882]"
          >
            <UIcon
              name="i-lucide-clipboard-check"
              class="work-task-row__icon-symbol"
            />
          </div>
          <div class="work-task-row__content">
            <NuxtLink
              :to="workHref('task', task.id)"
              class="block rounded-lg p-1 -m-1 hover:bg-[var(--color-surface-muted)]"
              ><p class="truncate font-semibold">
                <span
                  role="img"
                  :aria-label="priorityLabels[task.priority] ?? ''"
                  class="work-task-row__priority-dot"
                  :class="`work-task-row__priority-dot--${task.priority}`"
                ></span>{{ task.title
                }}<span class="work-task-row__mobile-apartment">
                  · {{ task.apartment.name }}</span
                >
              </p>
              <p class="mt-1 truncate text-sm text-[var(--color-muted)]">
                <span class="work-task-row__mobile-subtitle"
                  >{{
                    task.dueOn
                      ? formatDate(task.dueOn)
                      : t("work.noDeadline")
                  }}
                  · {{ task.assignee?.name ?? t("work.notAssigned") }}</span
                ><span class="work-task-row__desktop-subtitle"
                  >{{
                    task.dueOn
                      ? formatDate(task.dueOn)
                      : t("work.noDeadline")
                  }}
                  · {{ task.assignee?.name ?? t("work.notAssigned") }} ·
                  {{ task.apartment.name }} ·
                  {{ task.apartment.hotel.name }}</span
                >
              </p>
              <p
                v-if="task.hasProblem"
                class="mt-1 truncate text-sm text-red-700"
              >
                {{ task.problemDescription }}
              </p></NuxtLink
            >
          </div>
          <StatusBadge
            class="work-task-row__priority"
            :label="priorityLabels[task.priority] ?? ''"
            :tone="
              task.priority === 'urgent'
                ? 'danger'
                : task.priority === 'high'
                  ? 'warning'
                  : 'neutral'
            "
          /><StatusBadge
            class="work-task-row__status"
            :label="statusLabels[task.status] ?? ''"
            :tone="statusTones[task.status] ?? 'neutral'"
          />
          <div
            v-if="taskMenuItems(task).length"
            class="work-task-row__menu"
          >
            <UDropdownMenu
              :items="taskMenuItems(task)"
              :content="{ align: 'end' }"
              :modal="false"
              ><UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis-vertical"
                :aria-label="t('workExtra.taskActions')"
                class="min-h-11 min-w-11 active:scale-[0.96] transition-transform"
            /></UDropdownMenu>
          </div>
        </article>
      </div>
      <EmptyState
        v-else
        icon="i-lucide-clipboard-check"
        :title="t('workExtra.noTasks')"
        :description="t('workExtra.noTasksDescription')"
        ><template #actions
          ><UButton v-if="isAdministrator" @click="openCreateTask">{{
            t("work.newTask")
          }}</UButton></template
        ></EmptyState
      >
    </template>

    <USlideover
      v-model:open="taskOpen"
      :title="editingTask ? t('work.editTask') : t('work.newTask')"
      :modal="true"
      :overlay="true"
      ><template #body
        ><UForm
          :key="taskValidation.formKey.value"
          id="task-form"
          :state="taskValidationState"
          :validate="validateTask"
          :validate-on="taskValidation.validateOn.value"
          novalidate
          class="form-grid"
          @error="taskValidation.onError"
          @submit="saveTask"
        >
          <UFormField
            name="apartmentId"
            :label="t('work.apartment')"
            :help="editingTask ? t('workExtra.taskEditHint') : undefined"
            ><ApartmentSelect
              v-model="taskForm.apartmentId"
              :apartments="apartments ?? []"
              :disabled="Boolean(editingTask && editingTask.status !== 'open')"
              /></UFormField
          ><UFormField name="title" :label="t('workExtra.taskTitle')"
            ><UInput v-model="taskForm.title" /></UFormField
          ><UFormField name="description" :label="t('workExtra.taskDescription')"
            ><UTextarea v-model="taskForm.description" /></UFormField
          ><UFormField name="priority" :label="t('workExtra.taskPriority')"
            ><USelect
              v-model="taskForm.priority"
              :items="
                Object.entries(priorityLabels).map(([value, label]) => ({
                  value,
                  label,
                }))
              "
              class="w-full" /></UFormField
          ><UFormField name="assigneeId" :label="t('work.assignee')"
            ><USelect
              v-model="taskForm.assigneeId"
              :items="[
                { label: t('work.notAssigned'), value: 'unassigned' },
                ...(team ?? [])
                  .filter((member) => member.roles.some(role => ['cleaner', 'specialist', 'administrator'].includes(role)))
                  .map((member) => ({ label: member.name, value: member.id })),
              ]"
              class="w-full" /></UFormField
          ><UFormField v-if="isAdministrator" name="ownerCostEur" :label="t('workExtra.ownerCost')"
            ><MoneyInput v-model="taskForm.ownerCostEur" /></UFormField
          ><UFormField name="dueOn" :label="t('workExtra.dueDate')"
            ><DateInput v-model="taskForm.dueOn" /></UFormField
          ><UFormField name="checklist" :label="t('progress.checklist')" class="w-full"
            ><div class="space-y-2"><div v-for="(item, index) in taskForm.checklist" :key="index" class="flex gap-2"><UInput v-model="item.label" class="min-w-0 flex-1" /><UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" class="min-h-11 min-w-11" @click="taskForm.checklist.splice(index, 1)" /></div><UButton type="button" color="neutral" variant="soft" @click="taskForm.checklist.push({ label: '', checked: false })">Добавить пункт</UButton></div></UFormField
          ><UAlert
            v-if="error"
            color="error"
            variant="soft"
            :description="error"
          /></UForm></template
      ><template #footer
        ><div class="form-actions form-actions--footer">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="taskOpen = false"
            >{{ t("work.cancel") }}</UButton
          ><UButton type="submit" form="task-form" :loading="pending">{{
            editingTask ? t("common.save") : t("work.newTask")
          }}</UButton>
        </div></template
      ></USlideover
    >

    <CleaningFormSlideover
      v-model:open="cleaningOpen"
      :apartments="apartments ?? []"
      :stays="stays ?? []"
      :team="team ?? []"
      :editing-cleaning="editingCleaning"
      :initial-stay-id="initialStayId"
      :pending="pending"
      :error="error"
      @submit="saveCleaning"
    />

    <USlideover v-model:open="stockOpen" :title="t('work.stockTitle')"
      :modal="true"
      :overlay="true"
      ><template #body
        ><form
          id="stock-usage-form"
          class="form-grid"
          @submit.prevent="recordUsage"
        >
          <UFormField :label="t('work.consumable')"
            ><USelect
              v-model="usageForm.consumableId"
              :items="
                stockItems
                  .filter((item) => item.quantity > 0)
                  .map((item) => ({
                    label: `${item.consumable.name} · ${item.quantity} ${item.consumable.unit}`,
                    value: item.consumable.id,
                  }))
              "
              class="w-full"
              required /></UFormField
          ><UFormField :label="t('work.quantity')"
            ><UInput
              v-model.number="usageForm.quantity"
              type="number"
              min=".001"
              step=".001"
              required /></UFormField
          ><UFormField :label="t('workExtra.comment')"
            ><UInput v-model="usageForm.note" /></UFormField
          ><UAlert
            v-if="error"
            color="error"
            variant="soft"
            :description="error"
          /></form></template
      ><template #footer
        ><div class="form-actions form-actions--footer">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="stockOpen = false"
            >{{ t("work.cancel") }}</UButton
          ><UButton type="submit" form="stock-usage-form" :loading="pending">{{
            t("work.writeOff")
          }}</UButton>
        </div></template
      ></USlideover
    >

    <DeleteConfirmModal
      v-model:open="deleteOpen"
      :title="t('work.deleteWorkTitle', { kind: workToDelete?.kind === 'cleaning' ? t('work.deleteCleaning').toLocaleLowerCase() : t('work.deleteTask').toLocaleLowerCase() })"
      :description="t('work.deleteWorkDescription')"
      :loading="pending"
      :error="error"
      @confirm="removeWork"
    />
    <UModal v-model:open="cleaningProblemDeleteOpen" :title="t('problems.cleaningDeleteTitle')"><template #body><div class="space-y-5"><p>{{ t('problems.cleaningDeleteDescription') }}</p><div class="grid gap-2"><UButton color="neutral" variant="outline" :loading="pending" @click="removeWork('preserve')">{{ t('problems.deleteCleaningKeep') }}</UButton><UButton color="error" :loading="pending" @click="removeWork('delete')">{{ t('problems.deleteCleaningWith') }}</UButton><UButton color="neutral" variant="ghost" @click="cleaningProblemDeleteOpen = false">{{ t('common.cancel') }}</UButton></div></div></template></UModal>
  </section>
</template>
