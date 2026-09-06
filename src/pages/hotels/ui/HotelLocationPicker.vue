<script setup lang="ts">
import { HotelLocationMap } from '#fsd/entities/hotel'
import { useI18n } from 'vue-i18n'

defineProps<{
  latitude: number | null
  longitude: number | null
}>()
const { t } = useI18n()
const { id, ariaAttrs, emitFormFocus, emitFormBlur, emitFormInput, emitFormChange } = useFormField()

const emit = defineEmits<{
  'update:location': [location: { latitude: number, longitude: number }]
}>()

function updateLocation(location: { latitude: number, longitude: number }) {
  emit('update:location', location)
  emitFormInput()
  emitFormChange()
}
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
    <HotelLocationMap
      :latitude="latitude"
      :longitude="longitude"
      selectable
      :label="t('uiExtra.chooseLocation')"
      @update:location="updateLocation"
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
