<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { LeafletMouseEvent, Map, Marker } from 'leaflet'

const props = withDefaults(defineProps<{
  latitude: number | null
  longitude: number | null
  selectable?: boolean
  compact?: boolean
  label: string
}>(), { selectable: false, compact: false })

const emit = defineEmits<{
  'update:location': [location: { latitude: number, longitude: number }]
}>()

const mapElement = ref<HTMLElement | null>(null)
let map: Map | null = null
let marker: Marker | null = null
let leaflet: typeof import('leaflet') | null = null

const bansko: [number, number] = [41.83, 23.49]

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
  if (!props.selectable) return
  const location = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) }
  const point: [number, number] = [location.latitude, location.longitude]
  map?.panTo(point)
  if (marker) marker.setLatLng(point)
  else createMarker(point)
  emit('update:location', location)
}

function handleMapClick(event: LeafletMouseEvent) {
  selectLocation(event.latlng.lat, event.latlng.lng)
}

onMounted(async () => {
  if (!mapElement.value) return
  leaflet = await import('leaflet')
  const initialLocation = mapLocation() ?? bansko
  map = leaflet.map(mapElement.value, { center: initialLocation, zoom: 14, zoomControl: true })
  leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)
  if (props.selectable) map.on('click', handleMapClick)
  if (mapLocation()) createMarker(initialLocation)
  await nextTick()
  window.setTimeout(() => map?.invalidateSize(), 0)
})

watch(() => [props.latitude, props.longitude], () => {
  const location = mapLocation()
  if (!location || !map) return
  if (!marker) createMarker(location)
  else marker.setLatLng(location)
  map.panTo(location)
}, { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div class="hotel-location-map" :class="{ 'hotel-location-map--compact': compact }">
    <div ref="mapElement" class="hotel-location-map__canvas" role="application" :aria-label="label" />
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
