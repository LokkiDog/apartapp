<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PublicApartment } from '../../shared/catalogue'
const props = defineProps<{ apartment: PublicApartment, highlighted?: boolean, eager?: boolean }>()
const emit = defineEmits<{ highlight: [slug: string | null] }>()
const { copy, localePath, isRtl } = useSite()
const active = ref(0)
const failed = ref(false)
const revision = ref(0)
const current = computed(() => props.apartment.photos[active.value])
const href = computed(() => localePath(`/apartments/${props.apartment.slug}`))
const dots = computed(() => {
  const count = Math.min(5, props.apartment.photos.length)
  const start = Math.max(0, Math.min(active.value - 2, props.apartment.photos.length - count))
  return Array.from({ length: count }, (_, index) => start + index)
})
function select(index: number) {
  const next = Math.max(0, Math.min(index, props.apartment.photos.length - 1))
  if (next === active.value) return
  active.value = next
  failed.value = false
}
function retry() { failed.value = false; revision.value++ }
watch(() => props.apartment.photos.map(photo => photo.id).join(','), () => {
  active.value = 0; failed.value = false
})
let pointer: { x: number, y: number, id: number } | undefined
let suppressClick = false
function startSwipe(event: PointerEvent) {
  suppressClick = false
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
  if ((event.target as Element).closest('button')) return
  pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
}
function endSwipe(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  const dx = event.clientX - pointer.x
  const dy = event.clientY - pointer.y
  pointer = undefined
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.3) return
  suppressClick = true
  select(active.value + (dx < 0 ? 1 : -1) * (isRtl.value ? -1 : 1))
}
function photoClick(event: MouseEvent) {
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false }
}
function keys(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  event.stopPropagation()
  select(active.value + (event.key === 'ArrowRight' ? 1 : -1) * (isRtl.value ? -1 : 1))
}
function unhover(event: MouseEvent) {
  if (!(event.currentTarget as HTMLElement).contains(document.activeElement)) emit('highlight', null)
}
function blur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) emit('highlight', null)
}
</script>

<template>
  <article class="catalogue-card" :class="{ 'catalogue-card--highlighted': highlighted }" @mouseenter="emit('highlight', apartment.slug)" @mouseleave="unhover" @focusin="emit('highlight', apartment.slug)" @focusout="blur">
    <div class="card-gallery" role="group" :aria-label="`${copy.gallery}: ${apartment.title}`" @keydown="keys" @pointerdown="startSwipe" @pointerup="endSwipe" @pointercancel="pointer = undefined">
      <NuxtLink :to="href" class="card-photo-link" :aria-label="apartment.title" @click.capture="photoClick" @dragstart.prevent>
        <img v-if="current" :key="`${current.id}-${revision}`" :src="current.url" :alt="`${apartment.title} — ${copy.photo} ${active + 1}`" width="480" height="480" :loading="eager || active > 0 ? 'eager' : 'lazy'" decoding="async" draggable="false" @error="failed = true">
      </NuxtLink>
      <div v-if="failed || !current" class="card-photo-error" role="status"><span>{{ copy.photoError }}</span><button v-if="current" type="button" @click="retry">{{ copy.retry }}</button></div>
      <template v-if="apartment.photos.length > 1">
        <button type="button" class="card-photo-control card-photo-control--previous" :aria-label="copy.previousPhoto" :disabled="active === 0" @click.stop="select(active - 1)">{{ isRtl ? '›' : '‹' }}</button>
        <button type="button" class="card-photo-control card-photo-control--next" :aria-label="copy.nextPhoto" :disabled="active === apartment.photos.length - 1" @click.stop="select(active + 1)">{{ isRtl ? '‹' : '›' }}</button>
        <div class="card-photo-dots" aria-hidden="true"><span v-for="index in dots" :key="index" :data-active="active === index" /></div>
      </template>
      <span class="sr-only" aria-live="polite">{{ copy.photo }} {{ active + 1 }} / {{ apartment.photos.length }}</span>
    </div>
    <NuxtLink :to="href" class="card-description">
      <p v-if="apartment.mapLocation?.hotelName" class="card-hotel">{{ apartment.mapLocation.hotelName }}</p>
      <h3>{{ apartment.title }}</h3>
      <p class="card-facts">{{ copy.guests }} {{ apartment.capacity }} · {{ copy.rooms }} {{ apartment.rooms }}</p>
      <p v-if="apartment.summary" class="card-summary">{{ apartment.summary }}</p>
    </NuxtLink>
  </article>
</template>
