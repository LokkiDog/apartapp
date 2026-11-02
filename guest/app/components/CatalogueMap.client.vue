<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Map as LeafletMap, Marker, TileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PublicApartment } from '../../shared/catalogue'
import { catalogueLocations } from '../../shared/catalogue-map'
const props = defineProps<{ apartments: PublicApartment[], highlighted: string | null, visible?: boolean, expandable?: boolean, hotelOnly?: boolean }>()
const emit = defineEmits<{ select: [slug: string], expand: [] }>()
const { copy } = useSite()
const container = ref<HTMLElement>()
const failed = ref(false)
const loading = ref(true)
const groups = computed(() => catalogueLocations(props.apartments))
let map: LeafletMap | undefined
let tiles: TileLayer | undefined
let leaflet: typeof import('leaflet') | undefined
let markers: Marker[] = []
let observer: ResizeObserver | undefined
let disposed = false
let generation = 0
function updateHighlight() {
  groups.value.forEach((group, index) => {
    const selected = group.apartments.some(apartment => apartment.slug === props.highlighted)
    const marker = markers[index]
    marker?.getElement()?.classList.toggle('catalogue-marker--active', selected)
    if (!props.hotelOnly) marker?.getElement()?.setAttribute('aria-pressed', String(selected))
    marker?.setZIndexOffset(selected ? 1000 : 0)
  })
}
function renderMarkers() {
  if (!map || !leaflet) return
  markers.forEach(marker => marker.remove())
  markers = groups.value.map(group => {
    const label = props.hotelOnly ? group.name : group.apartments.length === 1 ? `${group.name} · ${group.apartments[0]!.title}` : String(group.apartments.length)
    const element = document.createElement('span')
    element.className = 'catalogue-marker-label'
    const text = document.createElement('span')
    text.className = 'catalogue-marker-text'
    text.textContent = label
    element.append(text)
    const marker = leaflet!.marker([group.latitude, group.longitude], {
      icon: leaflet!.divIcon({ html: element, className: 'catalogue-marker', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -44] }),
      title: group.apartments.length === 1 ? label : `${group.name}: ${label}`, alt: label, keyboard: !props.hotelOnly, interactive: !props.hotelOnly
    }).addTo(map!)
    if (props.hotelOnly) { marker.getElement()?.setAttribute('role', 'img'); marker.getElement()?.setAttribute('aria-label', label); return marker }
    marker.getElement()?.setAttribute('role', 'button')
    marker.getElement()?.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); marker.fire('click') }
    })
    if (group.apartments.length === 1) {
      marker.on('click', () => emit('select', group.apartments[0]!.slug))
    } else {
      const list = document.createElement('div')
      list.className = 'map-apartment-list'
      list.dir = document.documentElement.dir || 'ltr'
      const title = document.createElement('strong'); title.textContent = group.name; list.append(title)
      group.apartments.forEach(apartment => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = apartment.title
        button.addEventListener('click', () => { map?.closePopup(); emit('select', apartment.slug) })
        list.append(button)
      })
      marker.bindPopup(list, { className: 'catalogue-map-popup' })
    }
    return marker
  })
  updateHighlight()
  if (groups.value.length) {
    map.fitBounds(leaflet.latLngBounds(groups.value.map(group => [group.latitude, group.longitude])), { padding: [48, 48], maxZoom: 16, animate: false })
  }
}
async function initialize() {
  // Nuxt client-only wrappers replace their placeholder after mounted hooks.
  await nextTick()
  if (disposed) return
  if (!container.value || !groups.value.length) { loading.value = false; return }
  const request = ++generation
  failed.value = false; loading.value = true
  try {
    const library = await import('leaflet')
    if (disposed || request !== generation || !container.value) return
    leaflet = library
    map?.remove()
    map = library.map(container.value, { center: [41.837, 23.488], zoom: 14, scrollWheelZoom: false, zoomControl: false })
    library.control.zoom({ position: 'topright' }).addTo(map)
    map.attributionControl.setPrefix(false)
    tiles = library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    })
    tiles.on('tileerror', () => { failed.value = true; loading.value = false })
    tiles.on('load', () => { loading.value = false })
    tiles.addTo(map)
    renderMarkers()
    observer?.disconnect()
    observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
    observer.observe(container.value)
  } catch { if (!disposed) { failed.value = true; loading.value = false } }
}
function retry() {
  if (!map || !tiles) { void initialize(); return }
  failed.value = false; loading.value = true; tiles.redraw()
}
watch(() => props.apartments, () => { if (map) renderMarkers(); else void initialize() })
watch(() => props.highlighted, updateHighlight)
watch(() => copy.value, renderMarkers)
watch(() => props.visible, async value => { if (value) { await nextTick(); map?.invalidateSize({ pan: false }) } })
onMounted(initialize)
onBeforeUnmount(() => { disposed = true; generation++; observer?.disconnect(); map?.remove() })
</script>

<template>
  <section class="catalogue-map" :aria-label="copy.map" :aria-busy="loading">
    <div ref="container" class="catalogue-map-canvas" dir="ltr" />
    <div v-if="!groups.length" class="map-state" role="status">{{ copy.mapEmpty }}</div>
    <div v-else-if="failed" class="map-message" role="status"><span>{{ copy.mapError }}</span><button type="button" @click="retry">{{ copy.retry }}</button></div>
    <span v-else-if="loading" class="map-loading" role="status">{{ copy.mapLoading }}</span>
    <button v-if="expandable" type="button" class="map-expand" :aria-label="copy.expandMap" @click="emit('expand')">⤢</button>
  </section>
</template>
