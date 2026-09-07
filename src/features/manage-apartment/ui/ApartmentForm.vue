<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { apartmentInputSchema, isApartmentOwnerEligible, type ApartmentInput } from '@contracts/crm'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'
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
  afterCreate?: (apartmentId: string) => Promise<string | undefined>
}>(), {
  apartmentId: undefined,
  initialValue: () => ({})
})

const form = reactive<ApartmentFormState>(createApartmentFormState(props.initialValue))
const { t } = useI18n()
const pending = ref(false)
const error = ref('')
const validation = useSubmitFormValidation()
const validate = createFormValidator(apartmentInputSchema, t)

const activeHotels = computed(() => props.hotels.filter(hotel => hotel.status === 'active'))
const activeManagers = computed(() => props.managers.filter(member => member.status === 'active' && isApartmentOwnerEligible(member.roles)))
const ownerOptions = computed(() => activeManagers.value.map(member => ({
  label: member.name,
  value: member.id,
  roleLabel: member.roles.includes('administrator') ? t('roles.administrator') : t('roles.manager')
})))
const missingReferences = computed(() => [
  activeHotels.value.length ? null : { label: t('hotels.add'), to: '/hotels' },
  props.apartmentTypes.length ? null : { label: t('apartments.addType'), to: '/settings/apartment-types' }
].filter((item): item is { label: string; to: string } => Boolean(item)))
const canSubmit = computed(() => missingReferences.value.length === 0 && !pending.value)
const submitLabel = computed(() => props.mode === 'edit' ? t('common.save') : t('apartments.create'))
const inheritedChecklist = computed(() => props.apartmentTypes.find(type => type.id === form.apartmentTypeId)?.defaultChecklist ?? [])

function addChecklistItem() {
  form.additionalChecklist.push('')
}

function moveChecklistItem(index: number, direction: -1 | 1) {
  const next = index + direction
  if (next < 0 || next >= form.additionalChecklist.length) return
  const [item] = form.additionalChecklist.splice(index, 1)
  if (item !== undefined) form.additionalChecklist.splice(next, 0, item)
}

async function save(event: FormSubmitEvent<ApartmentInput>) {
  pending.value = true
  error.value = ''
  try {
    if (props.mode === 'edit') {
      if (!props.apartmentId) throw new Error(t('apartments.missingApartment'))
      await $fetch(`/api/apartments/${props.apartmentId}`, { method: 'PATCH', body: event.data })
    } else {
      const apartment = await $fetch<{ id: string }>('/api/apartments', { method: 'POST', body: event.data })
      await navigateTo(await props.afterCreate?.(apartment.id) ?? '/apartments')
      return
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
  <UForm
    :key="validation.formKey.value"
    :state="form"
    :validate="validate"
    :validate-on="validation.validateOn.value"
    novalidate
    class="apartment-form"
    @error="validation.onError"
    @submit="save"
  >
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
        >
          <UInput v-model="form.locationDetails" class="w-full" size="xl" placeholder="Например, 3 этаж, дверь 12, рядом с лифтом" autocomplete="off" />
        </UFormField>
      </div>
    </section>

    <section class="apartment-form-section surface">
      <div class="apartment-form-section__header">
        <div class="apartment-form-section__icon"><UIcon name="i-lucide-list-checks" class="size-5" /></div>
        <div>
          <h2 class="text-lg font-semibold">{{ t('apartmentChecklist.title') }}</h2>
          <p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('apartmentChecklist.hint') }}</p>
        </div>
      </div>

      <div class="mt-5">
        <p class="text-sm font-semibold">{{ t('apartmentChecklist.inherited') }}</p>
        <ul v-if="inheritedChecklist.length" class="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
          <li v-for="(item, index) in inheritedChecklist" :key="`${form.apartmentTypeId}-${index}`" class="flex items-start gap-2">
            <span class="mt-1 text-[var(--color-primary)]">{{ index + 1 }}.</span><span>{{ item }}</span>
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-[var(--color-muted)]">{{ t('apartmentChecklist.noInherited') }}</p>
      </div>

      <div class="mt-5 border-t border-[var(--color-line)] pt-4">
        <div class="flex items-start justify-between gap-3">
          <div><p class="text-sm font-semibold">{{ t('apartmentChecklist.additional') }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('apartmentChecklist.additionalHint') }}</p></div>
          <UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="addChecklistItem">{{ t('common.add') }}</UButton>
        </div>
        <div v-if="form.additionalChecklist.length" class="mt-3 space-y-2">
          <div v-for="(item, index) in form.additionalChecklist" :key="index" class="checklist-edit-row">
            <span class="grid size-8 shrink-0 place-items-center text-sm tabular-nums text-[var(--color-muted)]">{{ inheritedChecklist.length + index + 1 }}</span>
            <UFormField :name="`additionalChecklist.${index}`" class="min-w-0 flex-1"><UInput v-model="form.additionalChecklist[index]" class="w-full" :placeholder="t('common.action')" /></UFormField>
            <div class="checklist-edit-actions">
              <UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-up" :disabled="index === 0" :aria-label="t('common.action')" @click="moveChecklistItem(index, -1)" />
              <UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-down" :disabled="index === form.additionalChecklist.length - 1" :aria-label="t('common.action')" @click="moveChecklistItem(index, 1)" />
              <UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="t('common.removeItem')" @click="form.additionalChecklist.splice(index, 1)" />
            </div>
          </div>
        </div>
        <p v-else class="mt-3 text-sm text-[var(--color-muted)]">{{ t('apartmentChecklist.noAdditional') }}</p>
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
            :items="ownerOptions"
            multiple
            class="w-full"
            size="xl"
            :placeholder="t('apartments.managers')"
          >
            <template #item-label="{ item }">
              <span>{{ item.label }}</span><span class="text-[var(--color-muted)]"> · {{ item.roleLabel }}</span>
            </template>
          </USelect>
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
      <UCheckbox v-model="form.automaticLinenCollection" :label="t('apartments.automaticLinenCollection')" class="mt-5 min-h-11" />
    </section>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :title="t('apartments.saveError')" :description="error" />

    <div class="apartment-form-actions surface">
      <UButton
        to="/apartments"
        color="neutral"
        variant="ghost"
        class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
      >
        {{ t('common.cancel') }}
      </UButton>
      <p class="hidden text-sm text-[var(--color-muted)] sm:block">{{ t('apartments.saveRequiredHint') }}</p>
      <UButton
        type="submit"
        :loading="pending"
        :disabled="!canSubmit"
        class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
      >
        {{ submitLabel }}
      </UButton>
    </div>
  </UForm>
</template>
