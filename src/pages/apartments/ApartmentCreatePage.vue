<script setup lang="ts">
import {
  ApartmentForm,
  type ApartmentFormHotel,
  type ApartmentFormManager,
  type ApartmentFormType
} from '#fsd/features/manage-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'
import ApartmentPhotoPanel from './ApartmentPhotoPanel.vue'
import { useI18n } from 'vue-i18n'

const currentUser = useCurrentUser()
const { t } = useI18n()
if (currentUser.value && !currentUser.value.roles.includes('administrator')) {
  await navigateTo('/apartments')
}

const [
  { data: hotels, status: hotelsStatus, error: hotelsError },
  { data: users, status: usersStatus, error: usersError },
  { data: types, status: typesStatus, error: typesError }
] = await Promise.all([
  useAsyncData('apartment-form-hotels', () => currentUser.value ? $fetch<ApartmentFormHotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('apartment-form-users', () => currentUser.value ? $fetch<ApartmentFormManager[]>('/api/users') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('apartment-form-types', () => currentUser.value ? $fetch<ApartmentFormType[]>('/api/apartment-types') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
])

const loading = computed(() => [hotelsStatus.value, usersStatus.value, typesStatus.value].some(status => status === 'idle' || status === 'pending'))
const loadError = computed(() => hotelsError.value || usersError.value || typesError.value)
const pendingPhotos = ref<File[]>([])
const uploadPending = ref(false)
const photoError = ref('')

function addPhotos(files: File[]) {
  photoError.value = ''
  pendingPhotos.value = [...pendingPhotos.value, ...files]
}

function removePendingPhoto(index: number) {
  pendingPhotos.value = pendingPhotos.value.filter((_, itemIndex) => itemIndex !== index)
}

async function uploadPendingPhotos(apartmentId: string) {
  if (!pendingPhotos.value.length) return undefined
  uploadPending.value = true
  const failed: File[] = []
  for (const photo of pendingPhotos.value) {
    try {
      const body = new FormData()
      body.set('entityType', 'apartment')
      body.set('entityId', apartmentId)
      body.set('file', photo)
      await $fetch('/api/attachments', { method: 'POST', body })
    } catch {
      failed.push(photo)
    }
  }
  uploadPending.value = false
  pendingPhotos.value = failed
  return failed.length ? `/apartments/${apartmentId}/edit?photoUploadFailed=${failed.length}` : undefined
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('apartments.add')">
      <template #actions>
        <UButton
          to="/apartments"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {{ t('nav.apartments') }}
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
      :title="t('common.error')"
      :description="t('scope.loadErrorDescription')"
    />
    <template v-else>
      <UAlert v-if="photoError" color="error" variant="soft" :description="photoError" />
      <ApartmentPhotoPanel
        :pending-photos="pendingPhotos"
        :uploading="uploadPending"
        @select="addPhotos"
        @remove-pending="removePendingPhoto"
        @invalid-files="photoError = t('apartments.photoFormatError')"
      />
      <ApartmentForm
        mode="create"
        :hotels="hotels ?? []"
        :managers="users ?? []"
        :apartment-types="types ?? []"
        :after-create="uploadPendingPhotos"
      />
    </template>
  </section>
</template>
