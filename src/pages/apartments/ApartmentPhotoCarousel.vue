<script setup lang="ts">
import type { ApartmentPhotoAttachment } from './ApartmentPhotoPanel.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ photos: ApartmentPhotoAttachment[]; apartmentName: string; eager?: boolean }>()
const { t } = useI18n()
const viewport = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

function updateActiveIndex() {
  const element = viewport.value
  if (!element || !element.clientWidth) return
  activeIndex.value = Math.min(props.photos.length - 1, Math.max(0, Math.round(element.scrollLeft / element.clientWidth)))
}

function showPhoto(index: number) {
  const element = viewport.value
  if (!element) return
  element.scrollTo({ left: index * element.clientWidth, behavior: 'smooth' })
}

function previous() { showPhoto((activeIndex.value - 1 + props.photos.length) % props.photos.length) }
function next() { showPhoto((activeIndex.value + 1) % props.photos.length) }
</script>

<template>
  <div class="apartment-photo-carousel" @click.stop @keydown.stop>
    <div ref="viewport" class="apartment-photo-carousel__viewport" dir="ltr" @scroll.passive="updateActiveIndex">
      <img
        v-for="(photo, index) in photos"
        :key="photo.id"
        :src="`/api/attachments/${photo.id}/file?variant=card`"
        :alt="`${apartmentName}: ${photo.fileName}`"
        class="apartment-card__image apartment-photo-carousel__image"
        :loading="eager && index === 0 ? 'eager' : 'lazy'"
        :fetchpriority="eager && index === 0 ? 'high' : 'auto'"
        decoding="async"
      >
    </div>
    <template v-if="photos.length > 1">
      <UButton color="neutral" variant="solid" icon="i-lucide-chevron-left" class="apartment-photo-carousel__control apartment-photo-carousel__control--previous min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="t('apartments.previousPhoto')" @click="previous" />
      <UButton color="neutral" variant="solid" icon="i-lucide-chevron-right" class="apartment-photo-carousel__control apartment-photo-carousel__control--next min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="t('apartments.nextPhoto')" @click="next" />
      <span class="apartment-photo-carousel__counter" aria-live="polite">{{ t('apartments.photoPosition', { current: activeIndex + 1, total: photos.length }) }}</span>
    </template>
  </div>
</template>
