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
const pending = ref(false)
const error = ref('')

const activeHotels = computed(() => props.hotels.filter(hotel => hotel.status === 'active'))
const activeManagers = computed(() => props.managers.filter(member => member.status === 'active' && member.roles.includes('manager')))
const missingReferences = computed(() => [
  activeHotels.value.length ? null : { label: 'Добавить отель', to: '/hotels' },
  activeManagers.value.length ? null : { label: 'Добавить управляющего', to: '/settings/users' },
  props.apartmentTypes.length ? null : { label: 'Добавить тип и тариф', to: '/settings/apartment-types' }
].filter((item): item is { label: string; to: string } => Boolean(item)))
const canSubmit = computed(() => missingReferences.value.length === 0 && !pending.value)
const submitLabel = computed(() => props.mode === 'edit' ? 'Сохранить изменения' : 'Создать апартамент')

async function save(event: FormSubmitEvent<ApartmentInput>) {
  if (!canSubmit.value) return
  pending.value = true
  error.value = ''
  try {
    if (props.mode === 'edit') {
      if (!props.apartmentId) throw new Error('Не указан апартамент')
      await $fetch(`/api/apartments/${props.apartmentId}`, { method: 'PATCH', body: event.data })
    } else {
      await $fetch('/api/apartments', { method: 'POST', body: event.data })
    }
    await navigateTo('/apartments')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? cause?.message ?? 'Не удалось сохранить апартамент'
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
      title="Сначала заполните необходимые справочники"
    >
      <template #description>
        <p class="text-sm">Для апартамента нужны активный отель, управляющий и тип с тарифом.</p>
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
          <h2 class="text-lg font-semibold">Объект и расположение</h2>
          <p class="mt-1 text-sm text-[var(--color-muted)]">Как объект называется и где его найти внутри отеля.</p>
        </div>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="name" label="Название" required>
          <UInput v-model="form.name" class="w-full" size="xl" placeholder="Например, Mountain View 12" autocomplete="off" />
        </UFormField>
        <UFormField name="internalCode" label="Внутренний код" help="Уникальное короткое обозначение для команды." required>
          <UInput v-model="form.internalCode" class="w-full" size="xl" placeholder="Например, MV-12" autocomplete="off" />
        </UFormField>
        <UFormField name="hotelId" label="Апарт-отель" required>
          <USelect
            v-model="form.hotelId"
            :items="activeHotels.map(hotel => ({ label: hotel.name, value: hotel.id }))"
            class="w-full"
            size="xl"
            placeholder="Выберите отель"
          />
        </UFormField>
        <UFormField name="building" label="Корпус" help="Оставьте пустым, если в отеле нет корпусов.">
          <UInput v-model="form.building" class="w-full" size="xl" placeholder="Например, B" autocomplete="off" />
        </UFormField>
        <UFormField
          name="locationDetails"
          label="Расположение"
          help="Этаж, дверь и ориентиры, которые помогут быстро найти апартамент."
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
          <h2 class="text-lg font-semibold">Параметры и управление</h2>
          <p class="mt-1 text-sm text-[var(--color-muted)]">Ответственный, тип объекта и основные параметры размещения.</p>
        </div>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="managerId" label="Управляющий" required>
          <USelect
            v-model="form.managerId"
            :items="activeManagers.map(member => ({ label: member.name, value: member.id }))"
            class="w-full"
            size="xl"
            placeholder="Выберите управляющего"
          />
        </UFormField>
        <UFormField name="apartmentTypeId" label="Тип апартамента" required>
          <USelect
            v-model="form.apartmentTypeId"
            :items="apartmentTypes.map(type => ({ label: type.name, value: type.id }))"
            class="w-full"
            size="xl"
            placeholder="Выберите тип"
          />
        </UFormField>
      </div>

      <div class="apartment-form-fields apartment-form-fields--three mt-5">
        <UFormField name="capacity" label="Гостей" required>
          <UInput v-model.number="form.capacity" class="w-full tabular-nums" size="xl" type="number" min="1" max="50" />
        </UFormField>
        <UFormField name="rooms" label="Комнат" required>
          <UInput v-model.number="form.rooms" class="w-full tabular-nums" size="xl" type="number" min="1" max="20" />
        </UFormField>
        <UFormField name="sleepingPlaces" label="Спальных мест" required>
          <UInput v-model.number="form.sleepingPlaces" class="w-full tabular-nums" size="xl" type="number" min="1" max="50" />
        </UFormField>
      </div>

      <div class="apartment-form-fields apartment-form-fields--two mt-5">
        <UFormField name="checkInTime" label="Стандартный заезд" required>
          <UInput v-model="form.checkInTime" class="w-full tabular-nums" size="xl" type="time" />
        </UFormField>
        <UFormField name="checkOutTime" label="Стандартный выезд" required>
          <UInput v-model="form.checkOutTime" class="w-full tabular-nums" size="xl" type="time" />
        </UFormField>
      </div>
    </section>

    <section class="apartment-form-section surface">
      <div class="apartment-form-section__header">
        <div class="apartment-form-section__icon"><UIcon name="i-lucide-notebook-pen" class="size-5" /></div>
        <div>
          <h2 class="text-lg font-semibold">Инструкции для команды</h2>
          <p class="mt-1 text-sm text-[var(--color-muted)]">Ключи, доступ и особенности, которые важно знать управляющим и исполнителям.</p>
        </div>
      </div>
      <UFormField name="instructions" label="Инструкции" class="mt-5">
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

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" title="Не удалось сохранить" :description="error" />

    <div class="apartment-form-actions surface">
      <p class="hidden text-sm text-[var(--color-muted)] sm:block">Проверьте обязательные поля перед сохранением.</p>
      <div class="ml-auto flex items-center gap-2">
        <UButton
          to="/apartments"
          color="neutral"
          variant="ghost"
          class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          Отмена
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
