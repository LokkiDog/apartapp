<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { LeafletMouseEvent, Map, Marker } from 'leaflet'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  latitude: number | null
  longitude: number | null
}>()
const { t } = useI18n()

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
  marker = leaflet.marker(location, { draggable: true, icon }).addTo(map)
  marker.on('dragend', () => {
    const position = marker?.getLatLng()
    if (position) selectLocation(position.lat, position.lng)
  })
}

function selectLocation(latitude: number, longitude: number) {
  const location = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) }
  const point: [number, number] = [location.latitude, location.longitude]
  if (map) map.panTo(point)
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
  map.on('click', handleMapClick)
  if (mapLocation()) createMarker(initialLocation)
  await nextTick()
  window.setTimeout(() => map?.invalidateSize(), 0)
})

watch(() => [props.latitude, props.longitude], () => {
  const location = mapLocation()
  if (!location || !map) return
  if (!marker) createMarker(location)
  else marker.setLatLng(location)
}, { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div class="hotel-location-picker">
    <div ref="mapElement" class="hotel-location-picker__map" role="application" :aria-label="t('uiExtra.chooseLocation')" />
    <p class="hotel-location-picker__hint">{{ t('uiExtra.locationHint') }}</p>
  </div>
</template>

<style>
.hotel-location-picker {
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: 1rem;
  background: var(--color-surface-muted);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.08);
}

.hotel-location-picker__map {
  min-height: 280px;
  width: 100%;
  touch-action: pan-x pan-y;
}

.hotel-location-picker__hint {
  margin: 0;
  padding: 0.75rem 1rem;
  color: var(--color-muted);
  font-size: 0.8125rem;
  line-height: 1.35;
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
  .hotel-location-picker__map {
    min-height: 320px;
  }
}
</style>
