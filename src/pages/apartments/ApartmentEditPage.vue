<script setup lang="ts">
import type { ApartmentInput } from '@contracts/crm'
import {
  ApartmentForm,
  type ApartmentFormHotel,
  type ApartmentFormManager,
  type ApartmentFormType
} from '#fsd/features/manage-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { DeleteConfirmModal, PageHeader } from '#fsd/shared/ui'
import ApartmentPhotoPanel, { type ApartmentPhotoAttachment } from './ApartmentPhotoPanel.vue'
import { useI18n } from 'vue-i18n'

type ApartmentRecord = ApartmentInput & {
  id: string
  managers: Array<{ id: string, name: string }>
}
type Attachment = ApartmentPhotoAttachment

const route = useRoute()
const apartmentId = String(route.params.id)
const currentUser = useCurrentUser()
const { t } = useI18n()
if (currentUser.value && !currentUser.value.roles.includes('administrator')) {
  await navigateTo('/apartments')
}

const [
  { data: apartment, status: apartmentStatus, error: apartmentError, refresh: refreshApartment },
  { data: hotels, status: hotelsStatus, error: hotelsError },
  { data: users, status: usersStatus, error: usersError },
  { data: types, status: typesStatus, error: typesError },
  { data: photos, status: photosStatus, refresh: refreshPhotos }
] = await Promise.all([
  useAsyncData(`apartment-edit-${apartmentId}`, () => currentUser.value ? $fetch<ApartmentRecord>(`/api/apartments/${apartmentId}`) : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] }),
  useAsyncData('apartment-form-hotels', () => currentUser.value ? $fetch<ApartmentFormHotel[]>('/api/hotels') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('apartment-form-users', () => currentUser.value ? $fetch<ApartmentFormManager[]>('/api/users') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData('apartment-form-types', () => currentUser.value ? $fetch<ApartmentFormType[]>('/api/apartment-types') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] }),
  useAsyncData(`apartment-photos-${apartmentId}`, () => currentUser.value ? $fetch<Attachment[]>('/api/attachments', { query: { entityType: 'apartment', entityId: apartmentId } }) : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
])

const loading = computed(() => [apartmentStatus.value, hotelsStatus.value, usersStatus.value, typesStatus.value].some(status => status === 'idle' || status === 'pending'))
const loadError = computed(() => apartmentError.value || hotelsError.value || usersError.value || typesError.value)

const initialValue = computed<Partial<ApartmentInput>>(() => apartment.value ? {
  hotelId: apartment.value.hotelId,
  managerIds: apartment.value.managers.map(manager => manager.id),
  apartmentTypeId: apartment.value.apartmentTypeId,
  name: apartment.value.name,
  building: apartment.value.building,
  locationDetails: apartment.value.locationDetails,
  capacity: apartment.value.capacity,
  rooms: apartment.value.rooms,
  checkInTime: apartment.value.checkInTime,
  checkOutTime: apartment.value.checkOutTime,
  instructions: apartment.value.instructions,
  status: apartment.value.status
} : {})

const uploadPending = ref(false)
const pendingPhotos = ref<File[]>([])
const photoToDelete = ref<Attachment | null>(null)
const photoDeleteOpen = ref(false)
const photoDeletePending = ref(false)
const archivePending = ref(false)
const deleteOpen = ref(false)
const deletePending = ref(false)
const actionError = ref(route.query.photoUploadFailed ? t('apartments.photoUploadPartial') : '')
const actionSuccess = ref('')

function removePendingPhoto(index: number) {
  pendingPhotos.value = pendingPhotos.value.filter((_, itemIndex) => itemIndex !== index)
}

async function uploadPhotos(files: File[]) {
  pendingPhotos.value = [...pendingPhotos.value, ...files]
  uploadPending.value = true
  actionError.value = ''
  actionSuccess.value = ''
  const failed: File[] = []
  for (const photo of files) {
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
  pendingPhotos.value = failed
  await refreshPhotos()
  actionError.value = failed.length ? t('apartments.photoUploadPartial') : ''
  if (!failed.length) actionSuccess.value = t('apartments.photo')
  uploadPending.value = false
}

function askToDeletePhoto(attachment: Attachment) {
  actionError.value = ''
  photoToDelete.value = attachment
  photoDeleteOpen.value = true
}

async function removePhoto() {
  if (!photoToDelete.value) return
  photoDeletePending.value = true
  try {
    await $fetch(`/api/attachments/${photoToDelete.value.id}`, { method: 'DELETE' })
    await refreshPhotos()
    photoDeleteOpen.value = false
    photoToDelete.value = null
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    photoDeletePending.value = false
  }
}

async function archiveApartment() {
  archivePending.value = true
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await $fetch(`/api/apartments/${apartmentId}/archive`, { method: 'POST' })
    await refreshApartment()
    actionSuccess.value = t('apartments.archived')
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    archivePending.value = false
  }
}

function askToDelete() {
  actionError.value = ''
  actionSuccess.value = ''
  deleteOpen.value = true
}

async function removeApartment() {
  deletePending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/apartments/${apartmentId}`, { method: 'DELETE' })
    deleteOpen.value = false
    await navigateTo('/apartments')
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    deletePending.value = false
  }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('apartments.edit')">
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
      v-else-if="loadError || !apartment"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('apartments.emptyTitle')"
      :description="t('apartments.emptyDescription')"
    />
    <template v-else>
      <UAlert v-if="actionSuccess" color="success" variant="soft" icon="i-lucide-circle-check" :description="actionSuccess" />
      <UAlert v-if="actionError && !deleteOpen" color="error" variant="soft" icon="i-lucide-circle-alert" :description="actionError" />

      <ApartmentPhotoPanel
        :attachments="photos ?? []"
        :pending-photos="pendingPhotos"
        :loading="photosStatus === 'pending'"
        :uploading="uploadPending"
        @select="uploadPhotos"
        @remove-pending="removePendingPhoto"
        @remove-attachment="askToDeletePhoto"
        @invalid-files="actionError = t('apartments.photoFormatError')"
      />

      <ApartmentForm
        mode="edit"
        :apartment-id="apartmentId"
        :initial-value="initialValue"
        :hotels="hotels ?? []"
        :managers="users ?? []"
        :apartment-types="types ?? []"
      />

      <section class="apartment-management surface">
        <div class="apartment-danger-zone">
          <div class="min-w-0">
            <h3 class="font-semibold">{{ t('common.deleteForever') }}</h3>
            <p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('common.irreversible') }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="apartment.status !== 'archived'"
              color="neutral"
              variant="outline"
              icon="i-lucide-archive"
              :loading="archivePending"
              class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
              @click="archiveApartment"
            >
              {{ t('hotels.archive') }}
            </UButton>
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
              @click="askToDelete"
            >
              {{ t('common.deleteForever') }}
            </UButton>
          </div>
        </div>
      </section>
    </template>

    <DeleteConfirmModal
      v-model:open="photoDeleteOpen"
      :title="t('apartments.deletePhoto')"
      :description="t('apartments.deletePhotoDescription')"
      :loading="photoDeletePending"
      :error="actionError"
      @confirm="removePhoto"
    />

    <DeleteConfirmModal
      v-model:open="deleteOpen"
      :title="t('common.deleteForever')"
      :description="t('common.irreversible')"
      :loading="deletePending"
      :error="actionError"
      @confirm="removeApartment"
    />
  </section>
</template>
