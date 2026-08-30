<script setup lang="ts">
import type { Apartment } from "#fsd/entities/apartment";
import type { Cleaning } from "#fsd/entities/cleaning";
import type { Stay } from "#fsd/entities/stay";
import {
  createFormValidator,
  formatEuro,
  useSubmitFormValidation,
} from "#fsd/shared/lib";
import { DateInput, MoneyInput } from "#fsd/shared/ui";
import { useI18n } from "vue-i18n";
import { cleaningInputSchema } from "@contracts/crm";

type ChecklistItem = { label: string; checked: boolean };
type TeamOption = { label: string; value: string };
type TeamOptionGroup = Array<TeamOption | { type: "label"; label: string }>;
export type CleaningDraft = {
  apartmentId: string;
  stayId: string | null;
  cleanerIds: string[];
  scheduledOn: string;
  isUrgent: boolean;
  urgencyOverride: boolean | null;
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
  isUrgent: false,
  urgencyOverride: null,
  cleanerPoolEur: 0,
  laundryEur: 0,
  serviceEur: 0,
  checklist: [],
  reason: "",
});
const validation = useSubmitFormValidation();
const validateCleaningContract = createFormValidator(cleaningInputSchema, t);
function validate(state: unknown) {
  const errors = validateCleaningContract(state);
  if (linked.value && !form.stayId) {
    errors.push({ name: "stayId", message: t("validation.chooseBooking") });
  }
  if (tariffChanged.value && form.reason.trim().length < 3) {
    errors.push({ name: "reason", message: t("validation.tariffReason") });
  }
  return errors;
}
const standardChecklist = computed(() => [
  t("common.checklistLinen"),
  t("common.checklistBathroom"),
  t("common.checklistSupplies"),
]);
const tariffOpen = ref(false);
const noAssigneeConfirmationOpen = ref(false);
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
const automaticUrgent = computed(() => {
  if (!form.apartmentId || !form.scheduledOn) return false;
  return props.stays.some(stay => stay.apartmentId === form.apartmentId && stay.checkOutOn === form.scheduledOn)
    && props.stays.some(stay => stay.apartmentId === form.apartmentId && stay.checkInOn === form.scheduledOn);
});
const effectiveUrgent = computed(() => form.urgencyOverride ?? automaticUrgent.value);
const showAllStays = ref(false);
function currentLocalDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const availableStays = computed(() =>
  props.stays.filter(
    (stay) =>
      (showAllStays.value || stay.checkOutOn >= currentLocalDate()) &&
      (!stay.cleaning || stay.cleaning.id === props.editingCleaning?.id),
  ),
);
const cleanerOptions = computed(() => {
  const cleaners = props.team
    .filter((member) => member.roles.includes("cleaner"))
    .map((member) => ({ label: member.name, value: member.id }));
  const administrators = props.team
    .filter(
      (member) =>
        member.roles.includes("administrator") &&
        !member.roles.includes("cleaner"),
    )
    .map((member) => ({ label: member.name, value: member.id }));
  const groups: TeamOptionGroup[] = [];
  if (cleaners.length)
    groups.push([
      { type: "label" as const, label: t("common.cleaners"), value: "__cleaners__" },
      ...cleaners,
    ]);
  if (administrators.length)
    groups.push([
      { type: "label" as const, label: t("common.administrators"), value: "__administrators__" },
      ...administrators,
    ]);
  return groups;
});
const cleanerSummary = computed(() =>
  props.team
    .filter((member) => form.cleanerIds.includes(member.id))
    .map((member) => member.name)
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
const checklistChanged = computed(() => {
  if (!form.apartmentId) return false;
  const template = checklistFromApartment(form.apartmentId);
  return (
    form.checklist.length !== template.length ||
    form.checklist.some(
      (item, index) =>
        item.label !== template[index]?.label ||
        item.checked !== template[index]?.checked,
    )
  );
});

function reset() {
  const cleaning = props.editingCleaning;
  const stayId = cleaning?.stayId ?? props.initialStayId ?? null;
  const stay = props.stays.find((item) => item.id === stayId);
  linked.value = Boolean(stayId);
  showAllStays.value = false;
  Object.assign(form, {
    apartmentId: cleaning?.apartmentId ?? stay?.apartmentId ?? "",
    stayId,
    cleanerIds: cleaning?.assignments.map((item) => item.cleanerId) ?? [],
    scheduledOn: cleaning?.scheduledOn ?? stay?.checkOutOn ?? "",
    isUrgent: cleaning?.isUrgent ?? false,
    urgencyOverride: cleaning?.urgencyOverride ?? null,
    cleanerPoolEur: cleaning?.tariffSnapshot.cleanerPoolEur ?? 0,
    laundryEur: cleaning?.tariffSnapshot.laundryEur ?? 0,
    serviceEur: cleaning?.tariffSnapshot.serviceEur ?? 0,
    checklist:
      cleaning?.checklist.map((item) => ({ ...item })) ??
      checklistFromApartment(stay?.apartmentId ?? ""),
    reason: "",
  });
  tariffOpen.value = false;
  validation.reset();
}
watch([() => form.apartmentId, () => form.scheduledOn, automaticUrgent], () => {
  if (form.urgencyOverride === null) form.isUrgent = automaticUrgent.value;
});
function setUrgency(value: boolean) {
  form.urgencyOverride = value;
  form.isUrgent = value;
}
function useAutomaticUrgency() {
  form.urgencyOverride = null;
  form.isUrgent = automaticUrgent.value;
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
function emitSubmit() {
  emit("submit", {
    ...form,
    stayId: linked.value ? form.stayId : null,
    checklist: form.checklist.filter((item) => item.label.trim()),
  });
}
function confirmWithoutAssignee() {
  noAssigneeConfirmationOpen.value = false;
  emitSubmit();
}
function submit() {
  if (!props.editingCleaning && !form.cleanerIds.length) {
    noAssigneeConfirmationOpen.value = true;
    return;
  }
  emitSubmit();
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
      <UForm
        :key="validation.formKey.value"
        id="cleaning-form"
        :state="form"
        :validate="validate"
        :validate-on="validation.validateOn.value"
        novalidate
        class="form-grid"
        @error="validation.onError"
        @submit="submit"
      >
        <UFormField v-if="!editingCleaning" :label="t('common.cleaningType')"
          ><UFieldGroup class="w-full"
            ><UButton
              type="button"
              class="flex-1"
              :variant="linked ? 'solid' : 'soft'"
              @click="linked = true"
              >{{ t("common.byBooking") }}</UButton
            ><UButton
              type="button"
              class="flex-1"
              :variant="!linked ? 'solid' : 'soft'"
              @click="linked = false"
              >{{ t("common.unscheduled") }}</UButton
            ></UFieldGroup
          ></UFormField
        >
        <div
          class="cleaning-context-fields"
          :class="{ 'cleaning-context-fields--linked': linked }"
        >
          <UFormField v-if="linked" name="stayId" :label="t('common.booking')"
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
              @update:model-value="form.stayId = $event || null"
            >
              <template #content-bottom>
                <div class="border-t border-[var(--color-line)] p-2">
                  <UButton
                    type="button"
                    color="neutral"
                    variant="ghost"
                    class="w-full justify-center"
                    @click.stop="showAllStays = true"
                  >
                    {{ t("common.showAll") }}
                  </UButton>
                </div>
              </template>
            </USelect></UFormField>
          <UFormField name="apartmentId" :label="t('work.apartment')"
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
              @update:model-value="chooseApartment($event)"
          /></UFormField>
          <UFormField name="scheduledOn" :label="t('common.cleaningDate')" required
            ><DateInput
              v-model="form.scheduledOn"
              :disabled="!canChangeContext"
          /></UFormField>
        </div>
        <UFormField name="cleanerIds" :label="t('work.assignee')"
          ><USelectMenu
            v-model="form.cleanerIds"
            :items="cleanerOptions as any"
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
        <section class="rounded-2xl border border-[var(--color-line)] px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <UCheckbox :model-value="effectiveUrgent" :label="t('work.urgentCleaning')" class="min-h-11 items-center font-medium" @update:model-value="setUrgency(Boolean($event))" />
            <UButton v-if="form.urgencyOverride !== null" type="button" color="neutral" variant="ghost" size="sm" @click="useAutomaticUrgency">{{ t('work.useAutomatic') }}</UButton>
          </div>
          <p class="text-sm text-[var(--color-muted)]">{{ form.urgencyOverride === null ? t('work.urgencyAutomatic') : t('work.urgencyManual') }}</p>
        </section>
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
            <UFormField name="cleanerPoolEur" :label="t('reports.cleaning')"
              ><MoneyInput
                v-model="form.cleanerPoolEur"
                :empty-value="0"
                /></UFormField
            ><UFormField name="laundryEur" :label="t('common.laundry')"
              ><MoneyInput
                v-model="form.laundryEur"
                :empty-value="0"
                /></UFormField
            ><UFormField name="serviceEur" :label="t('common.service')"
              ><MoneyInput v-model="form.serviceEur" :empty-value="0"
            /></UFormField>
          </div>
        </section>
        <UFormField
          v-if="tariffOpen && tariffChanged"
          name="reason"
          :label="t('common.adjustment')"
          ><UTextarea v-model="form.reason"
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
                icon="i-lucide-plus"
                :disabled="!canChangeContext"
                @click="addChecklistItem"
                >{{ t("common.add") }}</UButton
              ><UButton
                v-if="checklistChanged"
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-rotate-ccw"
                :disabled="!canChangeContext || !form.apartmentId"
                @click="restoreChecklistTemplate"
                >{{ t("common.reset") }}</UButton
              >
            </div>
          </div>
          <div class="space-y-2">
            <div
              v-for="(item, index) in form.checklist"
              :key="index"
              class="flex items-center gap-2"
            >
              <UFormField :name="`checklist.${index}.label`" class="min-w-0 flex-1">
                <UInput
                  v-model="item.label"
                  class="w-full"
                  :disabled="!canChangeContext"
                  :placeholder="t('common.action')"
                />
              </UFormField><UButton
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
      </UForm>
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
  <UModal
    v-model:open="noAssigneeConfirmationOpen"
    :title="t('common.confirm')"
  >
    <template #body>
      <div class="space-y-5">
        <p class="text-sm leading-6 text-[var(--color-muted)]">
          {{ t("common.createWithoutAssignee") }}
        </p>
        <div class="form-actions">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="noAssigneeConfirmationOpen = false"
          >
            {{ t("common.chooseAssignee") }}
          </UButton>
          <UButton type="button" @click="confirmWithoutAssignee">
            {{ t("common.yes") }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
