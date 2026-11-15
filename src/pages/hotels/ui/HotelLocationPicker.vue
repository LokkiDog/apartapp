<script setup lang="ts">
import { HotelLocationMap, type HotelCoordinates, type HotelMapViewport } from '#fsd/entities/hotel'
import type { HotelLocationResult } from '@contracts/hotel-location-search'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  latitude: number | null
  longitude: number | null
  initialViewport: HotelMapViewport
}>()
const { t } = useI18n()
const { id, ariaAttrs, emitFormFocus, emitFormBlur, emitFormInput, emitFormChange } = useFormField()

const emit = defineEmits<{
  'update:location': [location: HotelCoordinates]
  'select-address': [location: HotelLocationResult]
}>()
const searchText = ref('')
const searchResults = ref<HotelLocationResult[]>([])
const searchStatus = ref<'idle' | 'pending' | 'done' | 'unavailable' | 'limited'>('idle')
let searchController: AbortController | undefined

function resetSearch() {
  searchController?.abort()
  searchController = undefined
  searchResults.value = []
  searchStatus.value = 'idle'
}

watch(searchText, resetSearch, { flush: 'sync' })

async function searchAddress() {
  const text = searchText.value.trim()
  if (text.length < 3 || searchStatus.value === 'pending') return
  resetSearch()
  const controller = new AbortController()
  searchController = controller
  searchStatus.value = 'pending'
  try {
    const { results } = await $fetch('/api/hotels/location-search', {
      method: 'POST', body: { text }, signal: controller.signal, retry: 0
    })
    if (searchController !== controller) return
    searchResults.value = results
    searchStatus.value = 'done'
  } catch (cause) {
    if (searchController !== controller) return
    searchStatus.value = (cause as { statusCode?: number }).statusCode === 429 ? 'limited' : 'unavailable'
  } finally {
    if (searchController === controller) searchController = undefined
  }
}

function chooseAddress(result: HotelLocationResult) {
  keepUserViewport()
  resetSearch()
  viewport.value = { latitude: result.latitude, longitude: result.longitude, zoom: result.area ? 14 : 17 }
  if (result.area) return
  emit('select-address', result)
  emitFormInput()
  emitFormChange()
}

const viewport = shallowRef(props.initialViewport)
const allowInitialViewport = ref(props.latitude === null || props.longitude === null)
const geolocationPending = ref(false)
const geolocationError = ref<'unavailable' | 'denied' | 'timeout'>()
let geolocationRequest = 0

watch(() => props.initialViewport, value => {
  if (allowInitialViewport.value) viewport.value = value
})

function stopGeolocation() {
  geolocationRequest += 1
  geolocationPending.value = false
}

function keepUserViewport() {
  allowInitialViewport.value = false
  stopGeolocation()
}

function locateDevice() {
  if (geolocationPending.value) return
  allowInitialViewport.value = false
  geolocationError.value = undefined
  if (!window.isSecureContext || !navigator.geolocation) {
    geolocationError.value = 'unavailable'
    return
  }

  const request = ++geolocationRequest
  geolocationPending.value = true
  navigator.geolocation.getCurrentPosition(
    ({ coords: { latitude, longitude } }) => {
      if (request !== geolocationRequest) return
      viewport.value = { latitude, longitude, zoom: 16 }
      geolocationPending.value = false
    },
    error => {
      if (request !== geolocationRequest) return
      geolocationError.value = error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable'
      geolocationPending.value = false
    },
    { timeout: 10_000 }
  )
}

function updateLocation(location: HotelCoordinates) {
  keepUserViewport()
  geolocationError.value = undefined
  resetSearch()
  emit('update:location', location)
  emitFormInput()
  emitFormChange()
}

onBeforeUnmount(() => {
  stopGeolocation()
  resetSearch()
})
</script>

<template>
  <div
    :id="id"
    class="hotel-location-picker"
    :class="{ 'hotel-location-picker--error': ariaAttrs?.['aria-invalid'] }"
    tabindex="0"
    v-bind="ariaAttrs"
    @focus="emitFormFocus"
    @blur="emitFormBlur"
  >
    <div class="space-y-1 px-3 py-2">
      <div class="flex items-center gap-2">
        <UFormField class="min-w-0 flex-1">
          <UInput
            v-model="searchText"
            :aria-label="t('hotels.addressSearch.placeholder')"
            :placeholder="t('hotels.addressSearch.placeholder')"
            :maxlength="200"
            class="min-h-11 w-full"
            @keydown.enter.prevent.stop="searchAddress"
          />
        </UFormField>
        <UButton
          type="button"
          class="min-h-11"
          icon="i-lucide-search"
          :disabled="searchText.trim().length < 3"
          :loading="searchStatus === 'pending'"
          @click="searchAddress"
        >{{ t('hotels.addressSearch.find') }}</UButton>
      </div>
      <ul v-if="searchResults.length" class="divide-y divide-[var(--color-line)]">
        <li v-for="(result, index) in searchResults" :key="index">
          <UButton type="button" color="neutral" variant="ghost" class="min-h-11 w-full justify-start whitespace-normal text-start" @click="chooseAddress(result)">
            {{ result.address }}

          </UButton>
        </li>
      </ul>
      <p v-else-if="searchStatus !== 'idle'" class="text-sm text-[var(--color-muted)]" role="status">
        {{ t(`hotels.addressSearch.${searchStatus}`) }}
      </p>
      <p class="text-xs text-[var(--color-muted)]">
        {{ t('hotels.addressSearch.attribution') }} <a href="https://www.geoapify.com/" target="_blank" rel="noopener" class="underline">Geoapify</a>
        <span v-if="searchResults.length"> · {{ [...new Set(searchResults.map(result => result.attribution))].join(" · ") }}</span>
      </p>
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        icon="i-lucide-locate-fixed"
        class="min-h-11"
        :loading="geolocationPending"
        @click="locateDevice"
      >{{ t('hotels.myLocation') }}</UButton>
      <p v-if="geolocationError" class="text-sm text-[var(--color-muted)]" role="status">
        {{ t(`hotels.geolocation.${geolocationError}`) }}
      </p>
    </div>
    <HotelLocationMap
      :latitude="latitude"
      :longitude="longitude"
      :viewport="viewport"
      selectable
      :label="t('uiExtra.chooseLocation')"
      @update:location="updateLocation"
      @interact="keepUserViewport"
    />
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

.hotel-location-picker--error {
  border-color: var(--color-error-500);
  box-shadow: 0 0 0 1px var(--color-error-500);
}

.hotel-location-picker__hint {
  margin: 0;
  padding: 0.75rem 1rem;
  color: var(--color-muted);
  font-size: 0.8125rem;
  line-height: 1.35;
}
</style>
