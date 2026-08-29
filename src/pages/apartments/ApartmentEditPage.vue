<script setup lang="ts">
import type { ApartmentInput } from '@contracts/crm'
import {
  ApartmentForm,
  type ApartmentFormHotel,
  type ApartmentFormManager,
  type ApartmentFormType
} from '#fsd/features/manage-apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { DeleteConfirmModal, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { useI18n } from 'vue-i18n'

type ApartmentRecord = ApartmentInput & {
  id: string
  managers: Array<{ id: string, name: string }>
}
type Attachment = { id: string, fileName: string }

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

const photo = ref<File | null>(null)
const uploadOpen = ref(false)
const uploadPending = ref(false)
const archivePending = ref(false)
const deleteOpen = ref(false)
const deletePending = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

function selectPhoto(event: Event) {
  photo.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function uploadPhoto() {
  if (!photo.value) return
  uploadPending.value = true
  actionError.value = ''
  actionSuccess.value = ''
  try {
    const body = new FormData()
    body.set('entityType', 'apartment')
    body.set('entityId', apartmentId)
    body.set('file', photo.value)
    await $fetch('/api/attachments', { method: 'POST', body })
    await refreshPhotos()
    uploadOpen.value = false
    photo.value = null
    actionSuccess.value = t('apartments.photo')
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    uploadPending.value = false
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

      <section class="apartment-photo-panel surface">
        <div class="apartment-photo-panel__header">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold">{{ t('apartments.photo') }}</h2>
              <StatusBadge
                :label="apartment.status === 'active' ? t('apartments.active') : apartment.status === 'inactive' ? t('apartments.inactive') : t('apartments.archived')"
                :tone="apartment.status === 'active' ? 'success' : 'neutral'"
              />
            </div>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-camera"
            class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]"
            @click="uploadOpen = true"
          >
            {{ t('common.addPhoto') }}
          </UButton>
        </div>

        <USkeleton v-if="photosStatus === 'pending'" class="apartment-photo-panel__skeleton" />
        <div v-else-if="photos?.length" class="apartment-photo-panel__gallery">
          <a
            v-for="(attachment, index) in photos"
            :key="attachment.id"
            :href="`/api/attachments/${attachment.id}/file`"
            target="_blank"
            rel="noreferrer"
            class="apartment-photo-panel__item"
          >
            <img
              :src="`/api/attachments/${attachment.id}/file?variant=card`"
              :alt="attachment.fileName"
              class="apartment-photo-panel__image"
              :loading="index === 0 ? 'eager' : 'lazy'"
              :fetchpriority="index === 0 ? 'high' : 'auto'"
              decoding="async"
            >
          </a>
        </div>
        <div v-else class="apartment-photo-panel__empty">
          <UIcon name="i-lucide-image" class="size-8" />
          <span>{{ t('apartments.photo') }}</span>
        </div>
      </section>

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

    <UModal v-model:open="uploadOpen" :title="t('common.addPhoto')">
      <template #body>
        <form id="apartment-photo-form" class="form-grid" @submit.prevent="uploadPhoto">
          <UFormField :label="t('apartments.photo')" help="JPG, PNG или WebP">
            <UInput type="file" accept="image/*" required @change="selectPhoto" />
          </UFormField>
          <UAlert v-if="actionError" color="error" variant="soft" :description="actionError" />
        </form>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton type="button" color="neutral" variant="ghost" @click="uploadOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" form="apartment-photo-form" :loading="uploadPending" :disabled="!photo">{{ t('common.add') }}</UButton>
        </div>
      </template>
    </UModal>

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
