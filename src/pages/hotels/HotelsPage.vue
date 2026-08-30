<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from "@nuxt/ui";
import type { Hotel } from "#fsd/entities/hotel";
import { useCurrentUser } from "#fsd/shared/auth";
import { createFormValidator, useSubmitFormValidation } from "#fsd/shared/lib";
import { EmptyState, PageHeader, StatusBadge } from "#fsd/shared/ui";
import HotelLocationPicker from "./ui/HotelLocationPicker.vue";
import { useI18n } from "vue-i18n";
import { hotelInputSchema, type HotelInput } from "@contracts/crm";

const user = useCurrentUser();
const { t } = useI18n();
const {
  data: hotels,
  refresh,
  status,
} = await useAsyncData(
  "hotels",
  () => (user.value ? $fetch<Hotel[]>("/api/hotels") : Promise.resolve([])),
  { server: false, default: () => [], watch: [user] },
);
const { data: apartments, refresh: refreshApartments } = await useAsyncData(
  "hotel-apartment-counts",
  () =>
    user.value
      ? $fetch<Array<{ id: string; hotel: { id: string } }>>("/api/apartments")
      : Promise.resolve([]),
  { server: false, default: () => [], watch: [user] },
);
const apartmentCount = (hotelId: string) =>
  (apartments.value ?? []).filter((apartment) => apartment.hotel.id === hotelId)
    .length;
const open = ref(false);
const error = ref("");
const pending = ref(false);
const archivePending = ref(false);
const deletePending = ref(false);
const deleteHotel = ref<Hotel | null>(null);
const deleteOpen = ref(false);
const hotelToEdit = ref<Hotel | null>(null);
const form = reactive<{
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}>({ name: "", address: "", latitude: null, longitude: null });
const validation = useSubmitFormValidation();
const validate = createFormValidator(hotelInputSchema, t, {
  pathMap: { latitude: "location", longitude: "location" },
  messages: { location: t("validation.chooseHotelLocation") },
  validate: (state) => {
    const value = state as typeof form;
    return value.latitude === null || value.longitude === null
      ? [{ name: "location", message: t("validation.chooseHotelLocation") }]
      : [];
  },
});
const geocoding = ref(false);
const manualAddress = ref(false);
let geocodeRequest = 0;
let geocodeController: AbortController | null = null;
const canSave = computed(() => !geocoding.value && !pending.value);
function resetForm() {
  geocodeRequest += 1;
  geocodeController?.abort();
  geocodeController = null;
  Object.assign(form, {
    name: "",
    address: "",
    latitude: null,
    longitude: null,
  });
  geocoding.value = false;
  manualAddress.value = false;
  error.value = "";
}
function openCreate() {
  hotelToEdit.value = null;
  resetForm();
  validation.reset();
  open.value = true;
}
function openEdit(hotel: Hotel) {
  hotelToEdit.value = hotel;
  Object.assign(form, {
    name: hotel.name,
    address: hotel.address,
    latitude: Number(hotel.latitude),
    longitude: Number(hotel.longitude),
  });
  geocoding.value = false;
  manualAddress.value = true;
  validation.reset();
  error.value = "";
  open.value = true;
}
watch(open, (value) => {
  if (!value && !pending.value) {
    hotelToEdit.value = null;
    resetForm();
  }
});
async function resolveAddress(latitude: number, longitude: number) {
  const request = ++geocodeRequest;
  geocodeController?.abort();
  geocodeController = new AbortController();
  geocoding.value = true;
  manualAddress.value = false;
  form.address = "";
  error.value = "";
  try {
    const response = await $fetch<{ address: string }>(
      "/api/hotels/reverse-geocode",
      { query: { latitude, longitude }, signal: geocodeController.signal },
    );
    if (request === geocodeRequest) form.address = response.address;
  } catch (cause: any) {
    if (request !== geocodeRequest) return;
    manualAddress.value = true;
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    if (request === geocodeRequest) geocoding.value = false;
  }
}
function updateLocation(location: { latitude: number; longitude: number }) {
  form.latitude = location.latitude;
  form.longitude = location.longitude;
  void resolveAddress(location.latitude, location.longitude);
}
async function save(event: FormSubmitEvent<HotelInput>) {
  pending.value = true;
  error.value = "";
  try {
    const body = event.data;
    if (hotelToEdit.value) {
      const endpoint: string = `/api/hotels/${hotelToEdit.value.id}`;
      await $fetch(endpoint, { method: "PATCH", body });
    } else await $fetch("/api/hotels", { method: "POST", body });
    open.value = false;
    hotelToEdit.value = null;
    resetForm();
    await refresh();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    pending.value = false;
  }
}
async function archive(hotel: Hotel) {
  archivePending.value = true;
  error.value = "";
  try {
    await $fetch(`/api/hotels/${hotel.id}/archive`, { method: "POST" });
    await refresh();
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    archivePending.value = false;
  }
}
function askToDelete(hotel: Hotel) {
  error.value = "";
  deleteHotel.value = hotel;
  deleteOpen.value = true;
}
async function removeHotel() {
  if (!deleteHotel.value) return;
  deletePending.value = true;
  error.value = "";
  try {
    const endpoint: string = `/api/hotels/${deleteHotel.value.id}`;
    await $fetch(endpoint, { method: "DELETE" });
    deleteOpen.value = false;
    deleteHotel.value = null;
    await Promise.all([refresh(), refreshApartments()]);
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t("common.error");
  } finally {
    deletePending.value = false;
  }
}
function hotelMenuItems(hotel: Hotel): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [];
  items.push({
    label: t("hotels.edit"),
    icon: "i-lucide-pencil",
    onSelect: () => openEdit(hotel),
  });
  if (hotel.status === "active")
    items.push({
      label: t("hotels.archive"),
      icon: "i-lucide-archive",
      onSelect: () => {
        void archive(hotel);
      },
    });
  items.push({
    label: t("hotels.delete"),
    icon: "i-lucide-trash-2",
    color: "error",
    onSelect: () => askToDelete(hotel),
  });
  return items;
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('hotels.title')">
      <template #actions>
        <UButton
          v-if="user?.roles.includes('administrator')"
          icon="i-lucide-plus"
          @click="openCreate"
          >{{ t("hotels.add") }}</UButton
        >
      </template>
    </PageHeader>

    <UAlert
      v-if="error && !deleteOpen"
      color="error"
      variant="soft"
      :description="error"
    />

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2">
      <USkeleton v-for="item in 4" :key="item" class="h-56 rounded-2xl" />
    </div>

    <div v-else-if="hotels?.length" class="grid gap-4 md:grid-cols-2">
      <article
        v-for="hotel in hotels"
        :key="hotel.id"
        class="surface hotel-card"
        :class="{ 'cursor-pointer': user?.roles.includes('administrator') }"
        @click="user?.roles.includes('administrator') && openEdit(hotel)"
      >
        <div class="hotel-card__header">
          <div class="hotel-card__icon">
            <UIcon name="i-lucide-hotel" class="size-5" />
          </div>

          <div class="hotel-card__content">
            <div
              class="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5"
            >
              <h2
                class="min-w-0 flex-1 truncate text-xl font-semibold leading-tight"
              >
                {{ hotel.name }}
              </h2>
              <StatusBadge
                class="shrink-0"
                :label="
                  hotel.status === 'active'
                    ? t('hotels.active')
                    : t('hotels.archived')
                "
                :tone="hotel.status === 'active' ? 'success' : 'neutral'"
              />
            </div>
            <p class="m-0 text-sm leading-5 text-[var(--color-muted)]">
              {{ hotel.address }}
            </p>
          </div>
        </div>

        <div class="hotel-card__footer">
          <p class="hotel-card__count">
            {{ t("hotels.apartmentsCount") }}:
            <strong class="tabular-nums">{{ apartmentCount(hotel.id) }}</strong>
          </p>
          <UButton
            class="hotel-card__route"
            :to="`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`"
            target="_blank"
            color="neutral"
            variant="ghost"
            icon="i-lucide-route"
            @click.stop
            >{{ t("hotels.route") }}</UButton
          >
          <div
            v-if="user?.roles.includes('administrator')"
            class="hotel-card__menu"
            @click.stop
          >
            <UDropdownMenu
              :items="hotelMenuItems(hotel)"
              :content="{ align: 'end' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis-vertical"
                :aria-label="t('hotels.actions')"
                :loading="archivePending"
                class="hotel-card__menu-trigger active:scale-[0.96] transition-transform"
              />
            </UDropdownMenu>
          </div>
        </div>
      </article>
    </div>

    <EmptyState
      v-else
      icon="i-lucide-hotel"
      :title="t('hotels.emptyTitle')"
      :description="t('hotels.emptyDescription')"
    >
      <template v-if="user?.roles.includes('administrator')" #actions
        ><UButton @click="openCreate">{{ t("hotels.add") }}</UButton></template
      >
    </EmptyState>

    <USlideover
      v-model:open="open"
      :title="hotelToEdit ? t('hotels.edit') : t('hotels.newTitle')"
    >
      <template #body>
        <UForm
          :key="validation.formKey.value"
          id="hotel-form"
          :state="form"
          :validate="validate"
          :validate-on="validation.validateOn.value"
          novalidate
          class="form-grid"
          @error="validation.onError"
          @submit="save"
        >
          <UFormField name="name" :label="t('hotels.name')" required
            ><UInput
              v-model="form.name"
              class="w-full"
              placeholder="Pine Trees"
          /></UFormField>
          <UFormField name="location" :label="t('hotels.location')">
            <HotelLocationPicker
              :latitude="form.latitude"
              :longitude="form.longitude"
              @update:location="updateLocation"
            />
          </UFormField>
          <p
            v-if="form.latitude === null || form.longitude === null"
            class="text-sm text-[var(--color-muted)]"
          >
            {{ t("hotels.choosePoint") }}
          </p>
          <div v-else class="grid grid-cols-2 gap-3">
            <UFormField :label="`${t('hotels.location')} (lat)`"
              ><UInput
                :model-value="form.latitude.toFixed(6)"
                class="w-full font-mono tabular-nums"
                readonly
            /></UFormField>
            <UFormField :label="`${t('hotels.location')} (lon)`"
              ><UInput
                :model-value="form.longitude.toFixed(6)"
                class="w-full font-mono tabular-nums"
                readonly
            /></UFormField>
          </div>
          <p
            v-if="geocoding"
            class="flex items-center gap-2 text-sm text-[var(--color-muted)]"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin"
            />{{ t("hotels.detectingAddress") }}
          </p>
          <UFormField
            name="address"
            v-else-if="
              form.latitude !== null &&
              form.longitude !== null &&
              !manualAddress
            "
            :label="t('hotels.addressByPoint')"
            ><UInput
              :model-value="form.address"
              class="w-full"
              readonly
          /></UFormField>
          <UFormField
            name="address"
            v-else
            :label="t('hotels.address')"
            :help="t('hotels.addressHint')"
          >
            <UInput
              v-model="form.address"
              class="w-full"
              placeholder="Street, number, Bansko"
          /></UFormField>
          <UAlert
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
            @click="open = false"
            >{{ t("hotels.cancel") }}</UButton
          ><UButton
            type="submit"
            form="hotel-form"
            :loading="pending"
            :disabled="!canSave"
            >{{
              hotelToEdit ? t("hotels.saveChanges") : t("hotels.save")
            }}</UButton
          >
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="deleteOpen" :title="t('hotels.delete')">
      <template #body>
        <div class="space-y-5">
          <p>{{ deleteHotel?.name }}</p>
          <UAlert
            color="error"
            variant="soft"
            :title="t('common.irreversible')"
            :description="t('calendar.deleteWarning')"
          />
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :description="error"
          />
          <div class="form-actions">
            <UButton
              color="neutral"
              variant="ghost"
              @click="deleteOpen = false"
              >{{ t("hotels.cancel") }}</UButton
            ><UButton
              color="error"
              :loading="deletePending"
              @click="removeHotel"
              >{{ t("common.deleteForever") }}</UButton
            >
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
