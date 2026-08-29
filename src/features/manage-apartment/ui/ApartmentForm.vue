<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { apartmentInputSchema, type ApartmentInput } from '@contracts/crm'
import {
  createApartmentFormState,
  type ApartmentFormHotel,
  type ApartmentFormManager,
  type ApartmentFormMode,
  type ApartmentFormState,
  type ApartmentFormType
} from '../model/apartment-form'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  mode: ApartmentFormMode
  apartmentId?: string
  initialValue?: Partial<ApartmentFormState>
  hotels: ApartmentFormHotel[]
  managers: ApartmentFormManager[]
  apartmentTypes: ApartmentFormType[]
}>(), {
  apartmentId: undefined,
  initialValue: () => ({})
})

const form = reactive<ApartmentFormState>(createApartmentFormState(props.initialValue))
const { t } = useI18n()
const pending = ref(false)
const error = ref('')

const activeHotels = computed(() => props.hotels.filter(hotel => hotel.status === 'active'))
const activeManagers = computed(() => props.managers.filter(member => member.status === 'active' && member.roles.includes('manager')))
const missingReferences = computed(() => [
  activeHotels.value.length ? null : { label: t('hotels.add'), to: '/hotels' },
  props.apartmentTypes.length ? null : { label: t('apartments.addType'), to: '/settings/apartment-types' }
].filter((item): item is { label: string; to: string } => Boolean(item)))
const canSubmit = computed(() => missingReferences.value.length === 0 && !pending.value)
const submitLabel = computed(() => props.mode === 'edit' ? t('apartments.saveChanges') : t('apartments.create'))

async function save(event: FormSubmitEvent<ApartmentInput>) {
  if (!canSubmit.value) return
  pending.value = true
  error.value = ''
  try {
    if (props.mode === 'edit') {
      if (!props.apartmentId) throw new Error(t('apartments.missingApartment'))
      await $fetch(`/api/apartments/${props.apartmentId}`, { method: 'PATCH', body: event.data })
    } else {
      await $fetch('/api/apartments', { method: 'POST', body: event.data })
    }
    await navigateTo('/apartments')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? cause?.message ?? t('apartments.saveError')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm :schema="apartmentInputSchema" :state="form" class="apartment-form" @submit="save">
    <UAlert
      v-if="missingReferences.length"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="t('apartments.directoriesTitle')"
    >
      <template #description>
        <p class="text-sm">{{ t('apartments.directoriesDescription') }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-for="item in missingReferences"
            :key="item.to"
            :to="item.to"
            color="warning"
            variant="soft"
            size="sm"
            class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            {{ item.label }}
          </UButton>
        </div>
      </template>
    </UAlert>

    <section class="apartment-form-section surface">
      <div class="apartment-form-section__header">
        <div class="apartment-form-section__icon"><UIcon name="i-lucide-map-pin" class="size-5" /></div>
        <div>
          <h2 class="text-lg font-semibold">{{ t('apartments.objectLocation') }}</h2>
        </div>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="name" :label="t('apartments.name')" required>
          <UInput v-model="form.name" class="w-full" size="xl" placeholder="Например, Mountain View 12" autocomplete="off" />
        </UFormField>
        <UFormField name="internalCode" :label="t('apartments.internalCode')" :help="t('apartments.internalCodeHelp')" required>
          <UInput v-model="form.internalCode" class="w-full" size="xl" placeholder="Например, MV-12" autocomplete="off" />
        </UFormField>
        <UFormField name="hotelId" :label="t('apartments.hotel')" required>
          <USelect
            v-model="form.hotelId"
            :items="activeHotels.map(hotel => ({ label: hotel.name, value: hotel.id }))"
            class="w-full"
            size="xl"
            :placeholder="t('apartments.chooseHotel')"
          />
        </UFormField>
        <UFormField name="building" :label="t('apartments.building')" :help="t('apartments.buildingHelp')">
          <UInput v-model="form.building" class="w-full" size="xl" placeholder="Например, B" autocomplete="off" />
        </UFormField>
        <UFormField
          name="locationDetails"
          :label="t('apartments.location')"
          :help="t('apartments.locationHelp')"
          class="apartment-form-field--wide"
        >
          <UInput v-model="form.locationDetails" class="w-full" size="xl" placeholder="Например, 3 этаж, дверь 12, рядом с лифтом" autocomplete="off" />
        </UFormField>
      </div>
    </section>

    <section class="apartment-form-section surface">
      <div class="apartment-form-section__header">
        <div class="apartment-form-section__icon"><UIcon name="i-lucide-sliders-horizontal" class="size-5" /></div>
        <div>
          <h2 class="text-lg font-semibold">{{ t('apartments.parameters') }}</h2>
        </div>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="managerIds" :label="t('apartments.managers')" :help="t('apartments.managersHelp')">
          <USelect
            v-model="form.managerIds"
            :items="activeManagers.map(member => ({ label: member.name, value: member.id }))"
            multiple
            class="w-full"
            size="xl"
            :placeholder="t('apartments.managers')"
          />
        </UFormField>
        <UFormField name="apartmentTypeId" :label="t('apartments.type')" required>
          <USelect
            v-model="form.apartmentTypeId"
            :items="apartmentTypes.map(type => ({ label: type.name, value: type.id }))"
            class="w-full"
            size="xl"
            :placeholder="t('apartments.chooseType')"
          />
        </UFormField>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="capacity" :label="t('apartments.guests')" required>
          <UInput v-model.number="form.capacity" class="w-full tabular-nums" size="xl" type="number" min="1" max="50" />
        </UFormField>
        <UFormField name="rooms" :label="t('apartments.rooms')" required>
          <UInput v-model.number="form.rooms" class="w-full tabular-nums" size="xl" type="number" min="1" max="20" />
        </UFormField>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="checkInTime" :label="t('apartments.standardCheckIn')" required>
          <UInput v-model="form.checkInTime" class="w-full tabular-nums" size="xl" type="time" />
        </UFormField>
        <UFormField name="checkOutTime" :label="t('apartments.standardCheckOut')" required>
          <UInput v-model="form.checkOutTime" class="w-full tabular-nums" size="xl" type="time" />
        </UFormField>
      </div>
    </section>

    <section class="apartment-form-section surface">
      <div class="apartment-form-section__header">
        <div class="apartment-form-section__icon"><UIcon name="i-lucide-notebook-pen" class="size-5" /></div>
        <div>
          <h2 class="text-lg font-semibold">{{ t('apartments.teamInstructions') }}</h2>
        </div>
      </div>
      <UFormField name="instructions" :label="t('apartments.instructions')" class="mt-5">
        <UTextarea
          v-model="form.instructions"
          :rows="5"
          autoresize
          class="w-full"
          size="xl"
          placeholder="Например: ключи находятся в локбоксе у входа…"
        />
      </UFormField>
    </section>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :title="t('apartments.saveError')" :description="error" />

    <div class="apartment-form-actions surface">
      <p class="hidden text-sm text-[var(--color-muted)] sm:block">{{ t('apartments.saveRequiredHint') }}</p>
      <div class="ml-auto flex items-center gap-2">
        <UButton
          to="/apartments"
          color="neutral"
          variant="ghost"
          class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          type="submit"
          icon="i-lucide-check"
          :loading="pending"
          :disabled="!canSubmit"
          class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {{ submitLabel }}
        </UButton>
      </div>
    </div>
  </UForm>
</template>
