<script setup lang="ts">
import type { PublicApartment } from '../../shared/catalogue'
const props = defineProps<{ apartment: PublicApartment }>()
const { copy } = useSite()
const section = useTemplateRef<HTMLElement>('section')
const mapReady = ref(false)
const hasCoordinates = computed(() => {
  const location = props.apartment.mapLocation
  return Boolean(location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180)
})
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (!section.value) return
  if (typeof IntersectionObserver === 'undefined') { mapReady.value = true; return }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { mapReady.value = true; observer?.disconnect() }
  }, { rootMargin: '200px' })
  observer.observe(section.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <section v-if="apartment.hotel || apartment.mapLocation || apartment.location" ref="section" class="apartment-location" aria-labelledby="apartment-location-title">
    <h2 id="apartment-location-title">{{ copy.whereYouStay }}</h2>
    <p v-if="apartment.hotel?.name || apartment.mapLocation?.hotelName" class="apartment-location-hotel">{{ apartment.hotel?.name || apartment.mapLocation?.hotelName }}</p>
    <p v-if="apartment.location" class="prose">{{ apartment.location }}</p>
    <div v-if="hasCoordinates" class="apartment-location-map"><ClientOnly><CatalogueMap v-if="mapReady" :apartments="[apartment]" :highlighted="apartment.slug" hotel-only /><template #fallback><div class="location-map-placeholder" aria-hidden="true" /></template></ClientOnly></div>
  </section>
</template>
