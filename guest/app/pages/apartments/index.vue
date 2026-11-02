<script setup lang="ts">
import { amenityGroups as allAmenityGroups } from '../../../../shared/contracts/amenities'
import type { PublicApartment } from '../../../shared/catalogue'
const { copy, pageUrl, locale } = useSite()
const { data: apartments, status, error, refresh } = await useFetch<PublicApartment[]>('/api/catalogue/apartments', { query: computed(() => ({ locale: locale.value })), default: () => [] })
useHead(() => ({ link: [{ rel: 'canonical', href: pageUrl('/apartments') }] }))
useSeoMeta({ title: () => copy.value.catalogueTitle, description: () => copy.value.catalogueIntro, ogTitle: () => copy.value.catalogueTitle, ogDescription: () => copy.value.catalogueIntro })
const hotelId = ref('')
const selectedAmenities = ref<string[]>([])
const hotels = computed(() => {
  const options = new Map<string, string>()
  for (const apartment of apartments.value) {
    const hotel = apartment.hotel ?? (apartment.mapLocation ? { id: apartment.mapLocation.hotelId, name: apartment.mapLocation.hotelName } : null)
    if (hotel) options.set(hotel.id, hotel.name)
  }
  return Array.from(options, ([id, name]) => ({ id, name }))
})
const amenityOptions = computed(() => Object.keys(copy.value.amenity).filter(code => apartments.value.some(apartment => apartment.amenities.includes(code))))
const filteredApartments = computed(() => apartments.value.filter(apartment =>
  (!hotelId.value || (apartment.hotel?.id ?? apartment.mapLocation?.hotelId) === hotelId.value)
  && selectedAmenities.value.every(code => apartment.amenities.includes(code))))
const filtersActive = computed(() => Boolean(hotelId.value || selectedAmenities.value.length))
function resetFilters() { hotelId.value = ''; selectedAmenities.value = [] }
const popularAmenities = ['pool', 'parking', 'wifi', 'air_conditioning']
const quickAmenities = computed(() => popularAmenities.filter(code => amenityOptions.value.includes(code)))
const amenityGroups = computed(() => [
  { title: copy.value.popularAmenities, codes: popularAmenities },
  ...allAmenityGroups.map(group => ({ title: copy.value.amenityGroups[group.key], codes: group.codes.filter(code => !popularAmenities.includes(code)) })),
].map(group => ({ ...group, codes: group.codes.filter(code => amenityOptions.value.includes(code)) })).filter(group => group.codes.length))
const activeFilterCount = computed(() => Number(Boolean(hotelId.value)) + selectedAmenities.value.length)
const filterDialog = useTemplateRef<HTMLDialogElement>('filterDialog')
const filterButton = useTemplateRef<HTMLButtonElement>('filterButton')
const draftHotelId = ref('')
const draftAmenities = ref<string[]>([])
const draftResultCount = computed(() => apartments.value.filter(apartment =>
  (!draftHotelId.value || (apartment.hotel?.id ?? apartment.mapLocation?.hotelId) === draftHotelId.value)
  && draftAmenities.value.every(code => apartment.amenities.includes(code))).length)
function toggleAmenity(code: string) {
  selectedAmenities.value = selectedAmenities.value.includes(code) ? selectedAmenities.value.filter(value => value !== code) : [...selectedAmenities.value, code]
}
function openFilters() {
  draftHotelId.value = hotelId.value
  draftAmenities.value = [...selectedAmenities.value]
  filterDialog.value?.showModal()
}
function clearDraft() { draftHotelId.value = ''; draftAmenities.value = [] }
function closeFilters() { filterDialog.value?.close() }
function filtersClosed() { filterButton.value?.focus({ preventScroll: true }) }
function applyFilters() {
  hotelId.value = draftHotelId.value
  selectedAmenities.value = [...draftAmenities.value]
  closeFilters()
}
const selected = ref<string | null>(null)
const hovered = ref<string | null>(null)
const highlighted = computed(() => hovered.value ?? selected.value)
const desktop = ref(false)
const catalogueVisible = ref(false)
const catalogueSection = useTemplateRef<HTMLElement>('catalogueSection')
const mapOpen = ref(false)
const dialog = useTemplateRef<HTMLDialogElement>('mapDialog')
const mapButton = useTemplateRef<HTMLButtonElement>('mapButton')
watch(filteredApartments, items => {
  if (!items.some(item => item.slug === selected.value)) selected.value = items[0]?.slug ?? null
  if (!items.some(item => item.slug === hovered.value)) hovered.value = null
}, { immediate: true })
let media: MediaQueryList | undefined
let catalogueObserver: IntersectionObserver | undefined
function resize() { desktop.value = media?.matches ?? false }
onMounted(() => {
  media = window.matchMedia('(min-width: 1024px)'); resize(); media.addEventListener('change', resize)
  if (catalogueSection.value) {
    catalogueObserver = new IntersectionObserver(([entry]) => { catalogueVisible.value = Boolean(entry?.isIntersecting) })
    catalogueObserver.observe(catalogueSection.value)
  }
})
onBeforeUnmount(() => { media?.removeEventListener('change', resize); catalogueObserver?.disconnect(); dialog.value?.close(); filterDialog.value?.close() })
let mapTrigger: HTMLElement | null = null
let pendingCard: string | null = null
function openMap() {
  mapTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : mapButton.value
  mapOpen.value = true
  dialog.value?.showModal()
}
function closeMap() { dialog.value?.close() }
function closed() {
  mapOpen.value = false
  if (pendingCard) {
    const slug = pendingCard; pendingCard = null
    void focusCard(slug)
  } else if (mapTrigger?.isConnected) mapTrigger.focus({ preventScroll: true })
}
function chooseApartment(slug: string) {
  selected.value = slug; hovered.value = null
  if (dialog.value?.open) { pendingCard = slug; closeMap() }
  else void focusCard(slug)
}
async function focusCard(slug: string) {
  await nextTick()
  const card = document.getElementById(`apartment-${slug}`)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' })
  card?.querySelector<HTMLAnchorElement>('.card-description')?.focus({ preventScroll: true })
}
</script>
<template>
  <main id="main">
    <SiteHero />
    <section id="apartments" ref="catalogueSection" class="catalogue" aria-labelledby="catalogue-title">
      <div v-if="apartments.length && !error" class="catalogue-filters">
        <button ref="filterButton" type="button" class="filter-chip filter-open" aria-haspopup="dialog" @click="openFilters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4m4 0h8M4 17h8m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="14" cy="17" r="2"/></svg><span>{{ copy.filters }}</span><span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span></button>
        <span class="filter-divider" aria-hidden="true" />
        <label class="filter-hotel"><span class="sr-only">{{ copy.hotelFilter }}</span><select v-model="hotelId" :class="{ 'filter-selected': hotelId }"><option value="">{{ copy.allHotels }}</option><option v-for="hotel in hotels" :key="hotel.id" :value="hotel.id">{{ hotel.name }}</option></select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></label>
        <button v-for="code in quickAmenities" :key="code" type="button" class="filter-chip filter-quick" :data-amenity="code" :aria-pressed="selectedAmenities.includes(code)" @click="toggleAmenity(code)"><AmenityIcon :code="code" /><span>{{ copy.amenity[code] }}</span></button>
        <button v-if="filtersActive" type="button" class="catalogue-filter-reset" @click="resetFilters">{{ copy.resetFilters }}</button>
      </div>
      <div class="catalogue-layout">
        <div class="catalogue-results">
          <h2 id="catalogue-title" class="section-title">{{ copy.apartments }}</h2>
          <div v-if="status === 'pending'" class="catalogue-grid" aria-busy="true"><div v-for="n in 4" :key="n" class="photo-skeleton" /></div>
          <div v-else-if="error" class="catalogue-state" role="alert"><p>{{ copy.error }}</p><button class="button" @click="refresh()">{{ copy.retry }}</button></div>
          <div v-else-if="!apartments.length" class="catalogue-state"><p>{{ copy.empty }}</p><p>{{ copy.emptyHint }}</p></div>
          <div v-else-if="!filteredApartments.length" class="catalogue-state" role="status"><p>{{ copy.noFilterResults }}</p><button type="button" class="button" @click="resetFilters">{{ copy.resetFilters }}</button></div>
          <div v-else class="catalogue-grid">
            <ApartmentCard v-for="(apartment, index) in filteredApartments" :id="`apartment-${apartment.slug}`" :key="apartment.slug" :apartment="apartment" :eager="index < 2" :highlighted="highlighted === apartment.slug" @highlight="hovered = $event" />
          </div>
        </div>
        <template v-if="filteredApartments.length && !error && status !== 'pending'">
          <div class="catalogue-map-column">
            <ClientOnly><CatalogueMap v-if="desktop" :apartments="filteredApartments" :highlighted="highlighted" expandable @select="chooseApartment" @expand="openMap" /></ClientOnly>
          </div>
          <button ref="mapButton" type="button" class="catalogue-map-button" :class="{ 'catalogue-map-button--visible': catalogueVisible }" @click="openMap">{{ copy.map }}</button>
        </template>
      </div>
    </section>
    <SiteHost />
    <dialog ref="filterDialog" class="catalogue-filter-dialog" aria-labelledby="filters-title" @close="filtersClosed" @click.self="closeFilters">
      <header class="filter-dialog-header"><h2 id="filters-title">{{ copy.filters }}</h2><button type="button" class="filter-close" :aria-label="copy.close" autofocus @click="closeFilters">×</button></header>
      <div class="filter-dialog-body">
        <section class="filter-dialog-section" aria-labelledby="filter-hotels-title"><h3 id="filter-hotels-title">{{ copy.hotels }}</h3><select v-model="draftHotelId" :aria-label="copy.hotelFilter"><option value="">{{ copy.allHotels }}</option><option v-for="hotel in hotels" :key="hotel.id" :value="hotel.id">{{ hotel.name }}</option></select></section>
        <section class="filter-dialog-section" aria-labelledby="filter-amenities-title"><h3 id="filter-amenities-title">{{ copy.amenities }}</h3>
          <fieldset v-for="group in amenityGroups" :key="group.title" class="filter-amenity-group"><legend>{{ group.title }}</legend><div class="filter-amenity-options"><label v-for="code in group.codes" :key="code" class="filter-chip"><input v-model="draftAmenities" class="sr-only" type="checkbox" :value="code"><AmenityIcon :code="code" /><span>{{ copy.amenity[code] }}</span><span v-if="draftAmenities.includes(code)" class="filter-check" aria-hidden="true">✓</span></label></div></fieldset>
        </section>
      </div>
      <footer class="filter-dialog-footer"><button type="button" class="filter-clear" @click="clearDraft">{{ copy.clearAllFilters }}</button><button type="button" class="filter-apply" @click="applyFilters">{{ copy.showApartments }} ({{ draftResultCount }})</button></footer>
    </dialog>
    <dialog ref="mapDialog" class="catalogue-map-dialog" :aria-label="copy.map" @close="closed" @click.self="closeMap">
      <div class="map-dialog-toolbar"><h2>{{ copy.map }}</h2><button type="button" class="map-dialog-close" :aria-label="copy.close" autofocus @click="closeMap">×</button></div>
      <ClientOnly><CatalogueMap v-if="mapOpen" :apartments="filteredApartments" :highlighted="highlighted" :visible="mapOpen" @select="chooseApartment" /></ClientOnly>
    </dialog>
  </main>
</template>
