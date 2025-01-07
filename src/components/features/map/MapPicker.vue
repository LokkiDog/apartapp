<template>
    <div class="flex flex-col gap-4">
        <div class="map-container">
            <div ref="mapElement" class="w-full h-full"></div>
            <div ref="centerMarker" class="custom-marker"></div>
        </div>
        <div class="flex justify-between">
            <Button label="Отмена" @click="$emit('closeMap')" />
            <Button label="Подтвердить" severity="success" @click="confirmLocation" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { MAPS_API_KEY, DEFAULT_LOCATION } from '@/config/constants'
import type { Point } from '@/types/apart.types'
import { loadGoogleMapsAPI } from '@/utils/maps'

const emit = defineEmits<{
    (e: 'location-selected', location: Point): void
    (e: 'closeMap'): void
}>()

declare const google: any

const mapElement = ref<HTMLElement | null>(null)
const centerMarker = ref<HTMLElement | null>(null)
const map = ref<any>(null)
const selectedLocation = ref<Point | null>(null)
const toast = useToast()

const initializeMap = () => {
    if (!mapElement.value) return

    map.value = new google.maps.Map(mapElement.value, {
        center: DEFAULT_LOCATION,
        zoom: 12,
        disableDefaultUI: true,
    })

    map.value.addListener('center_changed', () => {
        if (!map.value || !centerMarker.value) return

        centerMarker.value.classList.add('moving')
        selectedLocation.value = {
            lat: map.value.getCenter()!.lat(),
            lng: map.value.getCenter()!.lng(),
        }
    })

    map.value.addListener('idle', () => {
        if (centerMarker.value) {
            centerMarker.value.classList.remove('moving')
        }
    })
}

const confirmLocation = () => {
    if (selectedLocation.value) {
        emit('location-selected', selectedLocation.value)
        emit('closeMap')
    } else {
        toast.add({
            severity: 'warn',
            summary: 'Пустое значение',
            detail: 'Выберите точку на карте',
            life: 3000,
        })
    }
}

onMounted(async () => {
    try {
        await loadGoogleMapsAPI(MAPS_API_KEY)
        initializeMap()
    } catch (error) {
        console.error('Ошибка загрузки карты:', error)
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Не удалось загрузить карту',
            life: 3000,
        })
    }
})
</script>

<style scoped>
.map-container {
    height: 350px;
    border: 1px solid #ccc;
    position: relative;
}

.custom-marker {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 40px;
    height: 40px;
    background: url('@/assets/images/marker.png') no-repeat center center;
    background-size: contain;
    transform: translate(-50%, -50%) scale(1);
    transition: transform 0.2s ease;
    pointer-events: none;
}

.custom-marker.moving {
    transform: translate(-50%, -50%) scale(1.2);
}
</style>
