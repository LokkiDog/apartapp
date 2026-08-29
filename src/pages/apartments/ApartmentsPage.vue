<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { useI18n } from 'vue-i18n'

type Attachment = { id: string; fileName: string }
type Apartment = { id: string; name: string; building: string; status: string; capacity: number; rooms: number; locationDetails?: string; hotel: { id: string; name: string }; managers: Array<{ id: string; name: string }>; type: { name: string }; photo: Attachment | null }
const user = useCurrentUser()
const { t } = useI18n()
const { data: apartments, status } = await useAsyncData('apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const canEdit = computed(() => user.value?.roles.includes('administrator') ?? false)
function hotelLabel(apartment: Apartment) { return [apartment.hotel.name, apartment.building ? `${t('apartments.building')} ${apartment.building}` : ''].filter(Boolean).join(' · ') }
function openApartment(apartmentId: string) {
  if (canEdit.value) void navigateTo(`/apartments/${apartmentId}/edit`)
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('apartments.title')">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" to="/apartments/new" icon="i-lucide-plus">{{ t('apartments.add') }}</UButton></template>
    </PageHeader>
    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><USkeleton v-for="item in 6" :key="item" class="h-80 rounded-2xl" /></div>
    <div v-else-if="apartments?.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="(apartment, index) in apartments"
        :key="apartment.id"
        class="apartment-card surface"
        :class="{ 'apartment-card--interactive': canEdit }"
        :role="canEdit ? 'link' : undefined"
        :tabindex="canEdit ? 0 : undefined"
        :aria-label="canEdit ? `${t('apartments.edit')}: ${apartment.name}` : undefined"
        @click="openApartment(apartment.id)"
        @keydown.enter="openApartment(apartment.id)"
        @keydown.space.prevent="openApartment(apartment.id)"
      >
        <div class="apartment-card__media">
          <img
            v-if="apartment.photo"
            :src="`/api/attachments/${apartment.photo.id}/file?variant=card`"
            :alt="apartment.photo.fileName"
            class="apartment-card__image"
            :loading="index < 3 ? 'eager' : 'lazy'"
            :fetchpriority="index === 0 ? 'high' : 'auto'"
            decoding="async"
          >
          <div v-else class="apartment-card__placeholder">
            <UIcon name="i-lucide-building-2" class="size-9" />
            <span>{{ t('apartments.photo') }}</span>
          </div>
          <StatusBadge class="apartment-card__status" :label="apartment.status === 'active' ? t('apartments.active') : apartment.status === 'inactive' ? t('apartments.inactive') : t('apartments.archived')" :tone="apartment.status === 'active' ? 'success' : 'neutral'" />
        </div>

        <div class="apartment-card__body">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-[var(--color-primary)]">{{ hotelLabel(apartment) }}</p>
            <h2 class="mt-1 truncate text-xl font-semibold tracking-[-0.03em]">{{ apartment.name }}</h2>
            <p class="mt-1 min-h-10 text-sm leading-5 text-[var(--color-muted)]">{{ apartment.locationDetails || apartment.type.name }}</p>
          </div>

          <dl class="apartment-card__facts">
            <div><dt>{{ t('apartments.guests') }}</dt><dd>{{ apartment.capacity }}</dd></div>
            <div><dt>{{ t('apartments.rooms') }}</dt><dd>{{ apartment.rooms }}</dd></div>
          </dl>

          <div class="apartment-card__footer">
            <div class="min-w-0">
              <p class="text-xs text-[var(--color-muted)]">{{ t('apartments.managers') }}</p>
              <p class="truncate text-sm font-semibold">{{ apartment.managers.map(manager => manager.name).join(', ') || t('apartments.notAssigned') }}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
    <EmptyState v-else icon="i-lucide-building-2" :title="t('apartments.emptyTitle')" :description="t('apartments.emptyDescription')"><template v-if="user?.roles.includes('administrator')" #actions><UButton to="/apartments/new">{{ t('apartments.add') }}</UButton></template></EmptyState>
  </section>
</template>
