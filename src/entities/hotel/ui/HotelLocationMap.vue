<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { LeafletMouseEvent, Map, Marker } from 'leaflet'
import type { HotelCoordinates, HotelMapViewport } from '../model/hotel'
import { hotelNeighborhoodZoom, worldHotelViewport } from '../model/map-viewport'

const props = withDefaults(defineProps<{
  latitude: number | null
  longitude: number | null
  viewport?: HotelMapViewport
  selectable?: boolean
  compact?: boolean
  label: string
}>(), { selectable: false, compact: false })

const emit = defineEmits<{
  'update:location': [location: HotelCoordinates]
  interact: []
}>()

const mapElement = ref<HTMLElement | null>(null)
let map: Map | null = null
let marker: Marker | null = null
let leaflet: typeof import('leaflet') | null = null

function mapLocation(): [number, number] | null {
  if (props.latitude === null || props.longitude === null) return null
  return [props.latitude, props.longitude]
}

function createMarker(location: [number, number]) {
  if (!map || !leaflet) return
  const icon = leaflet.divIcon({
    className: 'hotel-map-marker',
    html: '<span aria-hidden="true"></span>',
    iconSize: [44, 44],
    iconAnchor: [22, 40]
  })
  marker?.remove()
  marker = leaflet.marker(location, { draggable: props.selectable, icon }).addTo(map)
  if (props.selectable) {
    marker.on('dragend', () => {
      const position = marker?.getLatLng()
      if (position) selectLocation(position.lat, position.lng)
    })
  }
}

function selectLocation(latitude: number, longitude: number) {
  if (!props.selectable || !map) return
  const wrapped = map.wrapLatLng([latitude, longitude])
  const location = { latitude: Number(wrapped.lat.toFixed(6)), longitude: Number(wrapped.lng.toFixed(6)) }
  emit('update:location', location)
}

function handleMapClick(event: LeafletMouseEvent) {
  selectLocation(event.latlng.lat, event.latlng.lng)
}

onMounted(async () => {
  const library = await import('leaflet')
  if (!mapElement.value) return
  leaflet = library
  const location = mapLocation()
  const viewport = props.viewport ?? worldHotelViewport
  map = leaflet.map(mapElement.value, {
    center: location ?? [viewport.latitude, viewport.longitude],
    zoom: location ? hotelNeighborhoodZoom : viewport.zoom,
    zoomControl: true
  })
  leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)
  if (props.selectable) map.on('click', handleMapClick)
  if (location) createMarker(location)
  await nextTick()
  window.setTimeout(() => map?.invalidateSize(), 0)
})

watch(() => [props.latitude, props.longitude], () => {
  const location = mapLocation()
  if (!map) return
  if (!location) {
    marker?.remove()
    marker = null
    return
  }
  if (!marker) createMarker(location)
  else marker.setLatLng(location)
  map.panTo(location)
})

watch(() => props.viewport, viewport => {
  if (viewport) map?.setView([viewport.latitude, viewport.longitude], viewport.zoom)
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div class="hotel-location-map" :class="{ 'hotel-location-map--compact': compact }">
    <div
      ref="mapElement"
      class="hotel-location-map__canvas"
      role="application"
      :aria-label="label"
      @pointerdown.capture="emit('interact')"
      @keydown.capture="emit('interact')"
      @wheel.capture.passive="emit('interact')"
    />
  </div>
</template>

<style>
.hotel-location-map,
.hotel-location-map__canvas {
  width: 100%;
  min-width: 0;
}

.hotel-location-map__canvas {
  min-height: 280px;
  touch-action: pan-x pan-y;
}

.hotel-location-map--compact .hotel-location-map__canvas {
  min-height: 240px;
}

.hotel-map-marker {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
}

.hotel-map-marker span {
  display: block;
  width: 24px;
  height: 24px;
  border: 4px solid white;
  border-radius: 999px 999px 999px 0;
  background: var(--color-primary);
  box-shadow: 0 3px 10px rgb(15 23 42 / 0.3);
  transform: rotate(-45deg);
}

.leaflet-control-zoom a {
  min-width: 44px;
  min-height: 44px;
  line-height: 42px;
}

@media (min-width: 640px) {
  .hotel-location-map__canvas {
    min-height: 320px;
  }

  .hotel-location-map--compact .hotel-location-map__canvas {
    min-height: 280px;
  }
}
</style>
