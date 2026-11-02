<script setup lang="ts">
import { clientResourceUrl } from "#fsd/shared/auth"
import { useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, PageHeader, StatusBadge } from '#fsd/shared/ui'
import { matchesApartmentSearch } from '#fsd/entities/apartment'
import { apartmentSortStorageKey, apartmentViewStorageKey, parseApartmentSort, parseApartmentView, type ApartmentSort, type ApartmentView } from './model/apartment-view'
import { matchesApartmentFilters } from './model/apartment-filters'
import { useApartmentFilters } from './model/use-apartment-filters'
import ApartmentPhotoCarousel from './ApartmentPhotoCarousel.vue'
import ApartmentPublicationBadge from './ApartmentPublicationBadge.vue'
import { useI18n } from 'vue-i18n'

type Attachment = { id: string; fileName: string }
type Apartment = { id: string; name: string; building: string; status: string; capacity: number; rooms: number; locationDetails?: string; createdAt: string; isPublished: boolean; hotel: { id: string; name: string }; managers: Array<{ id: string; name: string }>; type: { id: string; name: string }; photo: Attachment | null; photos: Attachment[] }

const user = useCurrentUser()
const { t, locale } = useI18n()
const { data: apartments, status } = await useAsyncData('apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const canEdit = computed(() => user.value?.roles.includes('administrator') ?? false)
const isAdministrator = canEdit
const canOpenSettings = computed(() => Boolean(user.value?.roles.some(role => ['administrator', 'manager'].includes(role))))
const view = ref<ApartmentView>('standard')
const sort = ref<ApartmentSort>('name')
const filtersOpen = ref(false)
const { filters, search, activeFilterCount, resetFilters } = useApartmentFilters(user)
const hotelOptions = computed(() => [
  { label: t('apartments.filterAll'), value: 'all' },
  ...Array.from(new Map((apartments.value ?? []).map(apartment => [apartment.hotel.id, { label: apartment.hotel.name, value: apartment.hotel.id }])).values()).sort((a, b) => a.label.localeCompare(b.label, locale.value))
])
const typeOptions = computed(() => [
  { label: t('apartments.filterAll'), value: 'all' },
  ...Array.from(new Map((apartments.value ?? []).map(apartment => [apartment.type.id, { label: apartment.type.name, value: apartment.type.id }])).values()).sort((a, b) => a.label.localeCompare(b.label, locale.value))
])
const statusOptions = computed(() => [
  { label: t('apartments.filterAll'), value: 'all' },
  { label: t('apartments.active'), value: 'active' },
  { label: t('apartments.inactive'), value: 'inactive' },
  { label: t('apartments.archived'), value: 'archived' }
])
const publicationOptions = computed(() => [
  { label: t('apartments.filterAll'), value: 'all' },
  { label: t('apartments.filterPublished'), value: 'published' },
  { label: t('apartments.filterUnpublished'), value: 'unpublished' },
])

const viewOptions: Array<{ value: ApartmentView; icon: string; label: string }> = [
  { value: 'compact', icon: 'i-lucide-layout-grid', label: 'apartments.compactView' },
  { value: 'dense', icon: 'i-lucide-grid-2x2', label: 'common.apartmentDenseView' },
  { value: 'standard', icon: 'i-lucide-panels-top-left', label: 'apartments.standardView' },
  { value: 'list', icon: 'i-lucide-list', label: 'apartments.listView' }
]
const sortOptions: Array<{ value: ApartmentSort; icon: string; label: string }> = [
  { value: 'name', icon: 'i-lucide-arrow-down-a-z', label: 'apartments.sortByName' },
  { value: 'createdAt', icon: 'i-lucide-clock-arrow-down', label: 'apartments.sortByDate' },
  { value: 'hotel', icon: 'i-lucide-building-2', label: 'apartments.sortByHotel' }
]
const selectedSort = computed(() => sortOptions.find(option => option.value === sort.value) ?? sortOptions[0]!)
const sortMenuItems = computed(() => sortOptions.map(option => ({
  label: t(option.label),
  icon: option.icon,
  type: 'checkbox' as const,
  checked: sort.value === option.value,
  onSelect: () => { sort.value = option.value }
})))
const filteredApartments = computed(() => (apartments.value ?? []).filter(apartment => matchesApartmentSearch({ name: apartment.name, hotelName: apartment.hotel.name }, search.value) && matchesApartmentFilters(apartment, filters, user.value?.id)))
const sortedApartments = computed(() => {
  const collator = new Intl.Collator(locale.value, { sensitivity: 'base' })
  return [...filteredApartments.value].sort((left, right) => {
    if (sort.value === 'createdAt') return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || collator.compare(left.name, right.name)
    if (sort.value === 'hotel') return collator.compare(left.hotel.name, right.hotel.name) || collator.compare(left.name, right.name)
    return collator.compare(left.name, right.name) || collator.compare(left.hotel.name, right.hotel.name)
  })
})

onMounted(() => {
  try {
    view.value = parseApartmentView(localStorage.getItem(apartmentViewStorageKey))
    sort.value = parseApartmentSort(localStorage.getItem(apartmentSortStorageKey))
  } catch { /* Keep defaults when browser storage is unavailable. */ }
})

watch(view, value => {
  if (import.meta.client) { try { localStorage.setItem(apartmentViewStorageKey, value) } catch { /* Storage is optional. */ } }
})

watch(sort, value => {
  if (import.meta.client) { try { localStorage.setItem(apartmentSortStorageKey, value) } catch { /* Storage is optional. */ } }
})

function hotelLabel(apartment: Apartment) { return [apartment.hotel.name, apartment.building ? `${t('apartments.building')} ${apartment.building}` : ''].filter(Boolean).join(' · ') }
function statusLabel(apartment: Apartment) { return apartment.status === 'active' ? t('apartments.active') : apartment.status === 'inactive' ? t('apartments.inactive') : t('apartments.archived') }
function statusTone(apartment: Apartment) { return apartment.status === 'active' ? 'success' : 'neutral' }
function openApartment(apartmentId: string) {
  if (canOpenSettings.value) void navigateTo(`/apartments/${apartmentId}/edit`)
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('apartments.title')">
      <template #actions><UButton v-if="user?.roles.includes('administrator')" to="/apartments/new" icon="i-lucide-plus">{{ t('apartments.add') }}</UButton></template>
    </PageHeader>

    <div class="apartment-view-toolbar">
      <UInput v-if="status !== 'pending' && apartments?.length" v-model="search" icon="i-lucide-search" :placeholder="t('common.searchApartment')" :aria-label="t('common.searchApartment')" class="apartment-search" />
      <div class="flex items-center gap-2">
        <UDropdownMenu :items="sortMenuItems" :content="{ align: 'start' }" :modal="false">
          <UButton color="neutral" variant="soft" icon="i-lucide-arrow-down-a-z" class="apartment-sort-button min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="t('apartments.sort')"><span class="hidden sm:inline">{{ t('apartments.sort') }}: {{ t(selectedSort.label) }}</span></UButton>
        </UDropdownMenu>
        <UButton :color="activeFilterCount ? 'primary' : 'neutral'" variant="soft" icon="i-lucide-sliders-horizontal" class="relative min-h-11 min-w-11" :aria-label="t('apartments.filters')" :aria-expanded="filtersOpen" @click="filtersOpen = true">
          <span class="hidden sm:inline">{{ t('apartments.filters') }}</span>
          <span v-if="activeFilterCount" class="apartment-filter-count tabular-nums">{{ activeFilterCount }}</span>
        </UButton>
      </div>
      <UFieldGroup class="apartment-view-switch" role="group" :aria-label="t('apartments.view')">
        <UButton v-for="option in viewOptions" :key="option.value" class="apartment-view-switch__button min-h-11 min-w-11 active:scale-[0.96] transition-transform" :color="view === option.value ? 'primary' : 'neutral'" :variant="view === option.value ? 'solid' : 'soft'" :icon="option.icon" :aria-label="t(option.label)" :aria-pressed="view === option.value" @click="view = option.value" />
      </UFieldGroup>
    </div>

    <USlideover v-model:open="filtersOpen" :title="t('apartments.filters')" :modal="true" :overlay="true">
      <template #body>
        <div class="grid gap-5">
          <UCheckbox v-model="filters.onlyMine" :label="t('apartments.onlyMine')" class="min-h-11 items-center" />
          <UFormField :label="t('apartments.filterHotel')"><USelect v-model="filters.hotelId" :items="hotelOptions" class="min-h-11 w-full" /></UFormField>
          <UFormField :label="t('apartments.filterType')"><USelect v-model="filters.typeId" :items="typeOptions" class="min-h-11 w-full" /></UFormField>
          <UFormField :label="t('apartments.filterStatus')"><USelect v-model="filters.status" :items="statusOptions" class="min-h-11 w-full" /></UFormField>
          <UFormField :label="t('apartments.filterPublication')"><USelect v-model="filters.publication" :items="publicationOptions" class="min-h-11 w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer w-full">
          <UButton color="neutral" variant="outline" :disabled="!activeFilterCount" class="min-h-11" @click="resetFilters">{{ t('apartments.resetFilters') }}</UButton>
          <UButton class="min-h-11" @click="filtersOpen = false">{{ t('apartments.showFiltered', { count: sortedApartments.length }) }}</UButton>
        </div>
      </template>
    </USlideover>

    <div v-if="status === 'pending'" class="apartments-collection" :class="`apartments-collection--${view}`"><USkeleton v-for="item in 6" :key="item" class="apartments-collection__skeleton" /></div>

    <div v-else-if="sortedApartments.length && view === 'compact'" class="apartments-collection apartments-collection--compact">
      <article v-for="apartment in sortedApartments" :key="apartment.id" class="apartment-compact-card surface" :class="{ 'apartment-compact-card--interactive': canOpenSettings }" :role="canOpenSettings ? 'link' : undefined" :tabindex="canOpenSettings ? 0 : undefined" :aria-label="canOpenSettings ? `${t(isAdministrator ? 'apartments.edit' : 'icalImport.apartmentSettings')}: ${apartment.name}` : undefined" @click="openApartment(apartment.id)" @keydown.enter="openApartment(apartment.id)" @keydown.space.prevent="openApartment(apartment.id)">
        <div class="apartment-compact-card__media">
          <img v-if="apartment.photo" :src="clientResourceUrl(`/api/attachments/${apartment.photo.id}/file?variant=card`)" :alt="`${apartment.name}: ${apartment.photo.fileName}`" class="apartment-card__image" loading="lazy" decoding="async">
          <div v-else class="apartment-card__placeholder"><UIcon name="i-lucide-building-2" class="size-7" /><span>{{ t('apartments.photo') }}</span></div>
          <StatusBadge class="apartment-compact-card__status" :label="statusLabel(apartment)" :tone="statusTone(apartment)" />
        </div>
        <div class="apartment-compact-card__body"><p class="truncate text-xs font-medium text-[var(--color-primary)]">{{ hotelLabel(apartment) }}</p><div class="flex min-w-0 items-center gap-2"><h2 class="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.02em]">{{ apartment.name }}</h2><ApartmentPublicationBadge v-if="apartment.isPublished" compact /></div></div>
      </article>
    </div>

    <div v-else-if="sortedApartments.length && view === 'list'" class="apartments-collection apartments-collection--list">
      <article v-for="apartment in sortedApartments" :key="apartment.id" class="apartment-list-item surface" :class="{ 'apartment-list-item--interactive': canOpenSettings }" :role="canOpenSettings ? 'link' : undefined" :tabindex="canOpenSettings ? 0 : undefined" :aria-label="canOpenSettings ? `${t(isAdministrator ? 'apartments.edit' : 'icalImport.apartmentSettings')}: ${apartment.name}` : undefined" @click="openApartment(apartment.id)" @keydown.enter="openApartment(apartment.id)" @keydown.space.prevent="openApartment(apartment.id)">
        <div class="apartment-list-item__media"><img v-if="apartment.photo" :src="clientResourceUrl(`/api/attachments/${apartment.photo.id}/file?variant=card`)" :alt="`${apartment.name}: ${apartment.photo.fileName}`" class="apartment-card__image" loading="lazy" decoding="async"><div v-else class="apartment-list-item__placeholder"><UIcon name="i-lucide-building-2" class="size-5" /></div></div>
        <div class="apartment-list-item__details"><div class="min-w-0"><div class="flex min-w-0 items-center gap-2"><h2 class="min-w-0 truncate font-semibold">{{ apartment.name }}</h2><ApartmentPublicationBadge v-if="apartment.isPublished" /></div><p class="truncate text-sm text-[var(--color-muted)]">{{ hotelLabel(apartment) }}</p></div><p class="hidden truncate text-sm text-[var(--color-muted)] sm:block">{{ apartment.locationDetails || apartment.type.name }}</p><p class="apartment-list-item__facts"><span>{{ t('apartments.guests') }}: <b>{{ apartment.capacity }}</b></span><span>{{ t('apartments.rooms') }}: <b>{{ apartment.rooms }}</b></span></p></div>
        <div class="apartment-list-item__owners"><p class="text-xs text-[var(--color-muted)]">{{ t('apartments.managers') }}</p><p class="truncate text-sm font-semibold">{{ apartment.managers.map(manager => manager.name).join(', ') || t('apartments.notAssigned') }}</p></div>
        <StatusBadge class="apartment-list-item__status" :label="statusLabel(apartment)" :tone="statusTone(apartment)" />
      </article>
    </div>

    <div v-else-if="sortedApartments.length" class="apartments-collection" :class="`apartments-collection--${view}`">
      <article v-for="(apartment, index) in sortedApartments" :key="apartment.id" class="apartment-card surface" :class="{ 'apartment-card--dense': view === 'dense', 'apartment-card--interactive': canOpenSettings }" :role="canOpenSettings ? 'link' : undefined" :tabindex="canOpenSettings ? 0 : undefined" :aria-label="canOpenSettings ? `${t(isAdministrator ? 'apartments.edit' : 'icalImport.apartmentSettings')}: ${apartment.name}` : undefined" @click="openApartment(apartment.id)" @keydown.enter="openApartment(apartment.id)" @keydown.space.prevent="openApartment(apartment.id)">
        <div class="apartment-card__media"><ApartmentPhotoCarousel v-if="apartment.photos.length" :photos="apartment.photos" :apartment-name="apartment.name" :eager="index < 3" /><div v-else class="apartment-card__placeholder"><UIcon name="i-lucide-building-2" class="size-9" /><span>{{ t('apartments.photo') }}</span></div><StatusBadge class="apartment-card__status" :label="statusLabel(apartment)" :tone="statusTone(apartment)" /></div>
        <div class="apartment-card__body"><div class="min-w-0"><p class="truncate text-sm font-medium text-[var(--color-primary)]">{{ hotelLabel(apartment) }}</p><div class="mt-1 flex min-w-0 items-center gap-2"><h2 class="min-w-0 truncate text-xl font-semibold tracking-[-0.03em]">{{ apartment.name }}</h2><ApartmentPublicationBadge v-if="apartment.isPublished" :compact="view === 'dense'" /></div><p class="mt-1 min-h-10 text-sm leading-5 text-[var(--color-muted)]">{{ apartment.locationDetails || apartment.type.name }}</p></div><dl class="apartment-card__facts"><div><dt>{{ t('apartments.guests') }}</dt><dd>{{ apartment.capacity }}</dd></div><div><dt>{{ t('apartments.rooms') }}</dt><dd>{{ apartment.rooms }}</dd></div></dl><div class="apartment-card__footer"><div class="min-w-0"><p class="text-xs text-[var(--color-muted)]">{{ t('apartments.managers') }}</p><p class="truncate text-sm font-semibold">{{ apartment.managers.map(manager => manager.name).join(', ') || t('apartments.notAssigned') }}</p></div></div></div>
      </article>
    </div>

    <EmptyState v-else-if="apartments?.length" icon="i-lucide-search-x" :title="t('common.noApartmentsFound')" />
    <EmptyState v-else icon="i-lucide-building-2" :title="t('apartments.emptyTitle')" :description="t('apartments.emptyDescription')"><template v-if="user?.roles.includes('administrator')" #actions><UButton to="/apartments/new">{{ t('apartments.add') }}</UButton></template></EmptyState>
  </section>
</template>
