<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, PageHeader, StatusBadge } from '#fsd/shared/ui'

type Apartment = { id: string; name: string; internalCode: string; building: string; status: string; capacity: number; rooms: number; locationDetails?: string; hotel: { id: string; name: string }; managers: Array<{ id: string; name: string }>; type: { name: string } }
type Attachment = { id: string; fileName: string }
const user = useCurrentUser()
const { data: apartments, status } = await useAsyncData('apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: photos } = await useAsyncData(
  'apartment-photos',
  async () => Object.fromEntries(await Promise.all((apartments.value ?? []).map(async apartment => [apartment.id, await $fetch<Attachment[]>('/api/attachments', { query: { entityType: 'apartment', entityId: apartment.id } })]))),
  { server: false, default: () => ({}), watch: [apartments] }
)
function hotelLabel(apartment: Apartment) { return [apartment.hotel.name, apartment.building ? `Корпус ${apartment.building}` : ''].filter(Boolean).join(' · ') }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Апартаменты" description="Объекты, размещение и ответственные управляющие.">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" to="/apartments/new" icon="i-lucide-plus">Добавить апартамент</UButton></template>
    </PageHeader>
    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><USkeleton v-for="item in 6" :key="item" class="h-80 rounded-2xl" /></div>
    <div v-else-if="apartments?.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="apartment in apartments" :key="apartment.id" class="apartment-card surface">
        <div class="apartment-card__media">
          <img v-if="photos?.[apartment.id]?.[0]" :src="`/api/attachments/${photos[apartment.id][0].id}/file`" :alt="photos[apartment.id][0].fileName" class="apartment-card__image">
          <div v-else class="apartment-card__placeholder">
            <UIcon name="i-lucide-building-2" class="size-9" />
            <span>Фото объекта</span>
          </div>
          <StatusBadge class="apartment-card__status" :label="apartment.status === 'active' ? 'Активен' : apartment.status === 'inactive' ? 'Неактивен' : 'В архиве'" :tone="apartment.status === 'active' ? 'success' : 'neutral'" />
        </div>

        <div class="apartment-card__body">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-[var(--color-primary)]">{{ hotelLabel(apartment) }}</p>
            <h2 class="mt-1 truncate text-xl font-semibold tracking-[-0.03em]">{{ apartment.name }}</h2>
            <p class="mt-1 min-h-10 text-sm leading-5 text-[var(--color-muted)]">{{ apartment.locationDetails || `Внутренний код ${apartment.internalCode}` }}</p>
          </div>

          <dl class="apartment-card__facts">
            <div><dt>Гостей</dt><dd>{{ apartment.capacity }}</dd></div>
            <div><dt>Комнат</dt><dd>{{ apartment.rooms }}</dd></div>
          </dl>

          <div class="apartment-card__footer">
            <div class="min-w-0">
              <p class="text-xs text-[var(--color-muted)]">Управляющие</p>
              <p class="truncate text-sm font-semibold">{{ apartment.managers.map(manager => manager.name).join(', ') || 'Не назначены' }}</p>
            </div>
            <UButton
              v-if="user?.roles.includes('administrator')"
              :to="`/apartments/${apartment.id}/edit`"
              color="neutral"
              variant="soft"
              icon="i-lucide-pencil"
              class="min-h-11 shrink-0 transition-transform duration-150 ease-out active:scale-[0.96]"
            >
              Изменить
            </UButton>
          </div>
        </div>
      </article>
    </div>
    <EmptyState v-else icon="i-lucide-building-2" title="Апартаментов пока нет" description="Сначала добавьте отель и тип апартамента, затем создайте первый объект."><template v-if="user?.roles.includes('administrator')" #actions><UButton to="/apartments/new">Добавить апартамент</UButton></template></EmptyState>
  </section>
</template>
