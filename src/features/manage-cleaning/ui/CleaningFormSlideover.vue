<script setup lang="ts">
import type { Apartment } from "#fsd/entities/apartment";
import type { Cleaning } from "#fsd/entities/cleaning";
import type { Stay } from "#fsd/entities/stay";
import { formatEuro } from "#fsd/shared/lib";
import { DateInput, MoneyInput } from "#fsd/shared/ui";
import { useI18n } from "vue-i18n";

type ChecklistItem = { label: string; checked: boolean };
export type CleaningDraft = {
  apartmentId: string;
  stayId: string | null;
  cleanerIds: string[];
  scheduledOn: string;
  cleanerPoolEur: number;
  laundryEur: number;
  serviceEur: number;
  checklist: ChecklistItem[];
  reason: string;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    apartments: Apartment[];
    stays: Stay[];
    team: Array<{ id: string; name: string; roles: string[] }>;
    editingCleaning?: Cleaning | null;
    initialStayId?: string | null;
    pending?: boolean;
    error?: string;
  }>(),
  { editingCleaning: null, initialStayId: null, pending: false, error: "" },
);
const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [draft: CleaningDraft];
}>();
const { t } = useI18n();
const linked = ref(
  Boolean(props.initialStayId || props.editingCleaning?.stayId),
);
const form = reactive<CleaningDraft>({
  apartmentId: "",
  stayId: null,
  cleanerIds: [],
  scheduledOn: "",
  cleanerPoolEur: 0,
  laundryEur: 0,
  serviceEur: 0,
  checklist: [],
  reason: "",
});
const standardChecklist = computed(() => [
  t("common.checklistLinen"),
  t("common.checklistBathroom"),
  t("common.checklistSupplies"),
]);
const tariffOpen = ref(false);
const tariffTotal = computed(() =>
  Number((form.cleanerPoolEur + form.laundryEur + form.serviceEur).toFixed(2)),
);
const tariffChanged = computed(() => {
  const before = props.editingCleaning?.tariffSnapshot;
  return Boolean(
    before &&
    (Number(before.cleanerPoolEur ?? 0) !== form.cleanerPoolEur ||
      Number(before.laundryEur ?? 0) !== form.laundryEur ||
      Number(before.serviceEur ?? 0) !== form.serviceEur),
  );
});
const selectedStay = computed(() =>
  props.stays.find((stay) => stay.id === form.stayId),
);
const availableStays = computed(() =>
  props.stays.filter(
    (stay) => !stay.cleaning || stay.cleaning.id === props.editingCleaning?.id,
  ),
);
const cleanerOptions = computed(() =>
  props.team
    .filter((member) => member.roles.includes("cleaner"))
    .map((member) => ({ label: member.name, value: member.id })),
);
const cleanerSummary = computed(() =>
  cleanerOptions.value
    .filter((option) => form.cleanerIds.includes(option.value))
    .map((option) => option.label)
    .join(", "),
);
const canChangeContext = computed(
  () =>
    !props.editingCleaning ||
    !["in_progress", "completed", "canceled"].includes(
      props.editingCleaning.status,
    ),
);
function checklistFromApartment(apartmentId: string) {
  const apartment = props.apartments.find((item) => item.id === apartmentId);
  const labels = apartment?.type?.defaultChecklist?.length
    ? apartment.type.defaultChecklist
    : standardChecklist.value;
  return labels.map((label) => ({ label, checked: false }));
}

function reset() {
  const cleaning = props.editingCleaning;
  const stayId = cleaning?.stayId ?? props.initialStayId ?? null;
  const stay = props.stays.find((item) => item.id === stayId);
  linked.value = Boolean(stayId);
  Object.assign(form, {
    apartmentId: cleaning?.apartmentId ?? stay?.apartmentId ?? "",
    stayId,
    cleanerIds: cleaning?.assignments.map((item) => item.cleanerId) ?? [],
    scheduledOn: cleaning?.scheduledOn ?? stay?.checkOutOn ?? "",
    cleanerPoolEur: cleaning?.tariffSnapshot.cleanerPoolEur ?? 0,
    laundryEur: cleaning?.tariffSnapshot.laundryEur ?? 0,
    serviceEur: cleaning?.tariffSnapshot.serviceEur ?? 0,
    checklist:
      cleaning?.checklist.map((item) => ({ ...item })) ??
      checklistFromApartment(stay?.apartmentId ?? ""),
    reason: "",
  });
  tariffOpen.value = false;
}
watch(
  () => props.open,
  (value) => {
    if (value) reset();
  },
);
watch(
  () => form.stayId,
  (value) => {
    const stay = props.stays.find((item) => item.id === value);
    if (!stay || !linked.value || !canChangeContext.value) return;
    form.apartmentId = stay.apartmentId;
    if (!form.scheduledOn) form.scheduledOn = stay.checkOutOn;
  },
);
watch(linked, (value) => {
  if (!value) form.stayId = null;
});
function chooseApartment(apartmentId: string) {
  form.apartmentId = apartmentId;
  const apartment = props.apartments.find((item) => item.id === apartmentId);
  const tariff = apartment?.tariffOverride ?? apartment?.type;
  if (tariff && !props.editingCleaning)
    Object.assign(form, {
      cleanerPoolEur: tariff.cleanerPoolEur,
      laundryEur: tariff.laundryEur,
      serviceEur: tariff.serviceEur,
      checklist: checklistFromApartment(apartmentId),
    });
}
watch(
  () => form.apartmentId,
  (value) => {
    if (!value || props.editingCleaning) return;
    const apartment = props.apartments.find((item) => item.id === value);
    const tariff = apartment?.tariffOverride ?? apartment?.type;
    if (tariff && !props.editingCleaning)
      Object.assign(form, {
        cleanerPoolEur: tariff.cleanerPoolEur,
        laundryEur: tariff.laundryEur,
        serviceEur: tariff.serviceEur,
      });
  },
);
function addChecklistItem() {
  form.checklist.push({ label: "", checked: false });
}
function restoreChecklistTemplate() {
  form.checklist = checklistFromApartment(form.apartmentId);
}
function submit() {
  if (!form.scheduledOn) return;
  if (tariffChanged.value && form.reason.trim().length < 3) return;
  emit("submit", {
    ...form,
    stayId: linked.value ? form.stayId : null,
    checklist: form.checklist.filter((item) => item.label.trim()),
  });
}
</script>

<template>
  <USlideover
    :open="open"
    :title="
      editingCleaning
        ? t('work.editCleaning')
        : initialStayId
          ? t('common.assignCleaning')
          : t('work.newCleaning')
    "
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <form id="cleaning-form" class="form-grid" @submit.prevent="submit">
        <UFormField v-if="!editingCleaning" :label="t('common.cleaningType')"
          ><UFieldGroup class="w-full"
            ><UButton
              type="button"
              class="flex-1"
              :variant="!linked ? 'solid' : 'soft'"
              @click="linked = false"
              >{{ t("common.unscheduled") }}</UButton
            ><UButton
              type="button"
              class="flex-1"
              :variant="linked ? 'solid' : 'soft'"
              @click="linked = true"
              >{{ t("common.byBooking") }}</UButton
            ></UFieldGroup
          ></UFormField
        >
        <div
          class="cleaning-context-fields"
          :class="{ 'cleaning-context-fields--linked': linked }"
        >
          <UFormField v-if="linked" :label="t('common.booking')"
            ><USelect
              :model-value="form.stayId ?? undefined"
              :items="
                availableStays.map((stay) => ({
                  label: `${stay.apartment.name} · ${t('common.departure')} ${stay.checkOutOn}`,
                  value: stay.id,
                }))
              "
              class="w-full"
              :disabled="!canChangeContext"
              required
              @update:model-value="form.stayId = $event || null"
          /></UFormField>
          <UFormField :label="t('work.apartment')"
            ><USelect
              :model-value="form.apartmentId"
              :items="
                apartments.map((apartment) => ({
                  label: `${apartment.name} · ${apartment.hotel.name}`,
                  value: apartment.id,
                }))
              "
              class="w-full"
              :disabled="linked || !canChangeContext"
              required
              @update:model-value="chooseApartment($event)"
          /></UFormField>
          <UFormField :label="t('common.cleaningDate')" required
            ><DateInput
              v-model="form.scheduledOn"
              :disabled="!canChangeContext"
          /></UFormField>
        </div>
        <UFormField :label="t('work.assignee')"
          ><USelectMenu
            v-model="form.cleanerIds"
            :items="cleanerOptions"
            value-key="value"
            multiple
            :disabled="!canChangeContext"
            :search-input="{
              placeholder: t('common.searchAssignee'),
              variant: 'none',
              ui: { root: 'm-2 w-auto self-stretch' },
            }"
            :content="{ align: 'start', sideOffset: 8, collisionPadding: 8 }"
            :ui="{
              base: 'w-full justify-start text-start',
              content: 'max-h-72',
              item: 'min-h-11 items-center',
              itemWrapper: 'justify-center',
              itemTrailing: 'self-center',
            }"
            class="w-full"
            ><template #default
              ><span
                v-if="cleanerSummary"
                class="min-w-0 flex-1 truncate text-start"
                >{{ cleanerSummary }}</span
              ><span
                v-else
                class="flex-1"
                aria-hidden="true" /></template></USelectMenu
        ></UFormField>
        <section
          class="w-full rounded-2xl bg-[var(--color-primary-soft)]py-3 sm:px-4"
        >
          <div class="flex min-w-0 items-center gap-2">
            <div
              class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-[var(--color-muted)]"
            >
              <p class="whitespace-nowrap">
                {{ t("work.assignee") }}
                <span
                  class="font-semibold tabular-nums text-base text-[var(--color-ink)]"
                  >{{ formatEuro(form.cleanerPoolEur) }}</span
                >
              </p>
              <p class="whitespace-nowrap">
                {{ t("common.total") }}
                <span
                  class="font-semibold tabular-nums text-base text-[var(--color-ink)]"
                  >{{ formatEuro(tariffTotal) }}</span
                >
              </p>
            </div>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11 shrink-0 px-1.5 text-[11px] active:scale-[0.96] transition-transform"
              :icon="
                tariffOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
              "
              @click="tariffOpen = !tariffOpen"
              >{{ tariffOpen ? t("common.hide") : t("common.show") }}</UButton
            >
          </div>
          <div v-if="tariffOpen" class="cleaning-tariff-fields">
            <UFormField :label="t('reports.cleaning')"
              ><MoneyInput
                v-model="form.cleanerPoolEur"
                :empty-value="0"
                required /></UFormField
            ><UFormField :label="t('common.laundry')"
              ><MoneyInput
                v-model="form.laundryEur"
                :empty-value="0"
                required /></UFormField
            ><UFormField :label="t('common.service')"
              ><MoneyInput v-model="form.serviceEur" :empty-value="0" required
            /></UFormField>
          </div>
        </section>
        <UFormField
          v-if="tariffOpen && tariffChanged"
          :label="t('common.adjustment')"
          ><UTextarea v-model="form.reason" required
        /></UFormField>
        <section>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-semibold">{{ t("common.checklist") }}</p>
              <p class="text-sm text-[var(--color-muted)]">
                {{ t("common.checklistHint") }}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-rotate-ccw"
                :disabled="!canChangeContext || !form.apartmentId"
                @click="restoreChecklistTemplate"
                >{{ t("common.template") }}</UButton
              ><UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-plus"
                :disabled="!canChangeContext"
                @click="addChecklistItem"
                >{{ t("common.add") }}</UButton
              >
            </div>
          </div>
          <div class="space-y-2">
            <div
              v-for="(item, index) in form.checklist"
              :key="index"
              class="flex items-center gap-2"
            >
              <UInput
                v-model="item.label"
                class="flex-1"
                :disabled="!canChangeContext"
                :placeholder="t('common.action')"
              /><UButton
                type="button"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :disabled="!canChangeContext"
                :aria-label="t('common.removeItem')"
                @click="form.checklist.splice(index, 1)"
              />
            </div>
          </div>
        </section>
        <UAlert
          v-if="editingCleaning?.status === 'in_progress'"
          color="warning"
          variant="soft"
          :description="t('common.startedCleaningHint')"
        /><UAlert
          v-if="error"
          color="error"
          variant="soft"
          :description="error"
        />
      </form>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton
          type="button"
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
          >{{ t("common.cancel") }}</UButton
        ><UButton
          type="submit"
          form="cleaning-form"
          :loading="pending"
          :disabled="
            !form.scheduledOn ||
            Boolean(tariffChanged && form.reason.trim().length < 3)
          "
          >{{
            editingCleaning
              ? t("calendar.saveChanges")
              : initialStayId
                ? t("common.assignCleaning")
                : t("work.newCleaning")
          }}</UButton
        >
      </div>
    </template>
  </USlideover>
</template>
