<script setup lang="ts">
import {
  ApartmentForm,
  type ApartmentFormHotel,
  type ApartmentFormManager,
  type ApartmentFormType
} from '#fsd/features/manage-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'

const currentUser = useCurrentUser()
if (currentUser.value && !currentUser.value.roles.includes('administrator')) {
  await navigateTo('/apartments')
}

const [
  { data: hotels, status: hotelsStatus, error: hotelsError },
  { data: users, status: usersStatus, error: usersError },
  { data: types, status: typesStatus, error: typesError }
] = await Promise.all([
  useAsyncData('apartment-form-hotels', () => $fetch<ApartmentFormHotel[]>('/api/hotels'), { server: false }),
  useAsyncData('apartment-form-users', () => $fetch<ApartmentFormManager[]>('/api/users'), { server: false }),
  useAsyncData('apartment-form-types', () => $fetch<ApartmentFormType[]>('/api/apartment-types'), { server: false })
])

const loading = computed(() => [hotelsStatus.value, usersStatus.value, typesStatus.value].some(status => status === 'idle' || status === 'pending'))
const loadError = computed(() => hotelsError.value || usersError.value || typesError.value)
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Новый апартамент" description="Добавьте объект, расположение и рабочие параметры.">
      <template #actions>
        <UButton
          to="/apartments"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          К списку
        </UButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="mx-auto grid max-w-5xl gap-5">
      <USkeleton class="h-72 rounded-2xl" />
      <USkeleton class="h-80 rounded-2xl" />
      <USkeleton class="h-52 rounded-2xl" />
    </div>
    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Не удалось загрузить форму"
      description="Обновите страницу или попробуйте ещё раз позже."
    />
    <ApartmentForm
      v-else
      mode="create"
      :hotels="hotels ?? []"
      :managers="users ?? []"
      :apartment-types="types ?? []"
    />
  </section>
</template>
