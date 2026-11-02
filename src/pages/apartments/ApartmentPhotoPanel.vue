<script setup lang="ts">
import { clientResourceUrl } from "#fsd/shared/auth"
import { useI18n } from 'vue-i18n'

export type ApartmentPhotoAttachment = { id: string; fileName: string }

const props = withDefaults(defineProps<{
  attachments?: ApartmentPhotoAttachment[]
  pendingPhotos?: File[]
  loading?: boolean
  uploading?: boolean
  reordering?: boolean
  disabled?: boolean
  orderError?: string
}>(), {
  attachments: () => [],
  pendingPhotos: () => [],
  loading: false,
  uploading: false,
  reordering: false,
  disabled: false,
  orderError: ''
})

const emit = defineEmits<{
  select: [files: File[]]
  removePending: [index: number]
  removeAttachment: [attachment: ApartmentPhotoAttachment]
  invalidFiles: []
  reorder: [photoIds: string[]]
}>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const previews = ref<Array<{ file: File; url: string }>>([])
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function revokePreviews() {
  if (import.meta.client) previews.value.forEach(preview => URL.revokeObjectURL(preview.url))
}

watch(() => props.pendingPhotos, files => {
  revokePreviews()
  previews.value = import.meta.client ? files.map(file => ({ file, url: URL.createObjectURL(file) })) : []
}, { immediate: true })

onBeforeUnmount(revokePreviews)

function choosePhotos() {
  input.value?.click()
}

function selectPhotos(event: Event) {
  const selected = Array.from((event.target as HTMLInputElement).files ?? [])
  const photos = selected.filter(file => acceptedTypes.has(file.type))
  if (photos.length !== selected.length) emit('invalidFiles')
  if (photos.length) emit('select', photos)
  ;(event.target as HTMLInputElement).value = ''
}
const busy = computed(() => props.disabled || props.reordering || props.uploading)
const gallery = ref<HTMLElement | null>(null)
type PhotoSlot = { left: number, top: number, width: number, height: number }
const drag = ref<{
  id: string, pointerId: number, startX: number, startY: number,
  left: number, top: number, offsetX: number, offsetY: number,
  width: number, height: number, moved: boolean, overGallery: boolean,
  slots: PhotoSlot[], order: string[]
} | null>(null)
const displayedPhotos = computed(() => {
  if (!drag.value?.moved) return props.attachments
  const photos = new Map(props.attachments.map(photo => [photo.id, photo]))
  return drag.value.order.map(id => photos.get(id)!).filter(Boolean)
})
const draggedPhoto = computed(() => props.attachments.find(photo => photo.id === drag.value?.id))
const orderNotice = ref('')
watch(() => props.reordering, (pending, wasPending) => {
  if (pending) orderNotice.value = t('apartments.photoOrderSaving')
  else if (wasPending) orderNotice.value = props.orderError ? '' : t('apartments.photoOrderSaved')
})
watch(busy, value => { if (value) drag.value = null })

function reorder(fromId: string, toId: string) {
  if (busy.value || fromId === toId) return
  const ids = props.attachments.map(photo => photo.id)
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return
  ids.splice(from, 1)
  ids.splice(to, 0, fromId)
  emit('reorder', ids)
}
function startDrag(event: PointerEvent, id: string) {
  if (busy.value || props.attachments.length < 2 || !event.isPrimary || event.button !== 0 || !gallery.value) return
  const photo = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const slots = Array.from(gallery.value.querySelectorAll<HTMLElement>('[data-apartment-photo-id]')).map(item => {
    const rect = item.getBoundingClientRect()
    return { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height }
  })
  gallery.value.setPointerCapture(event.pointerId)
  drag.value = {
    id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
    left: photo.left, top: photo.top, offsetX: event.clientX - photo.left, offsetY: event.clientY - photo.top,
    width: photo.width, height: photo.height, moved: false, overGallery: true,
    slots, order: props.attachments.map(item => item.id)
  }
}
function moveDrag(event: PointerEvent) {
  const current = drag.value
  if (!current || event.pointerId !== current.pointerId) return
  if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6 && !current.moved) return
  event.preventDefault()
  current.moved = true
  current.left = event.clientX - current.offsetX
  current.top = event.clientY - current.offsetY
  const x = event.clientX + window.scrollX
  const y = event.clientY + window.scrollY
  const slots = current.slots
  current.overGallery = x >= Math.min(...slots.map(slot => slot.left)) - 16
    && x <= Math.max(...slots.map(slot => slot.left + slot.width)) + 16
    && y >= Math.min(...slots.map(slot => slot.top)) - 16
    && y <= Math.max(...slots.map(slot => slot.top + slot.height)) + 16
  if (!current.overGallery) return
  const distances = slots.map(slot => Math.hypot(x - slot.left - slot.width / 2, y - slot.top - slot.height / 2))
  const to = distances.indexOf(Math.min(...distances))
  const ids = props.attachments.map(photo => photo.id).filter(id => id !== current.id)
  ids.splice(to, 0, current.id)
  current.order = ids
  if (event.clientY < 90) window.scrollBy({ top: -16 })
  else if (event.clientY > window.innerHeight - 70) window.scrollBy({ top: 16 })
}
function finishDrag(event: PointerEvent) {
  const current = drag.value
  if (!current || event.pointerId !== current.pointerId) return
  drag.value = null
  if (current.moved && current.overGallery && current.order.some((id, index) => id !== props.attachments[index]?.id)) emit('reorder', current.order)
}
function movePhoto(index: number, direction: number) {
  const photo = props.attachments[index]
  const target = props.attachments[index + direction]
  if (photo && target) reorder(photo.id, target.id)
}
</script>

<template>
  <section class="apartment-photo-panel surface">
    <div class="apartment-photo-panel__header">
      <div>
        <h2 class="text-lg font-semibold">{{ t('apartments.photo') }}</h2>
        <p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('apartments.photoHint') }}</p>
      </div>
      <input ref="input" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple @change="selectPhotos">
      <UButton color="neutral" variant="soft" icon="i-lucide-camera" class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]" :loading="uploading" :disabled="busy" @click="choosePhotos">
        {{ t('common.addPhoto') }}
      </UButton>
    </div>

    <UAlert v-if="orderError" color="error" :description="orderError" />
    <p class="sr-only" role="status" aria-live="polite">{{ orderNotice }}</p>
    <USkeleton v-if="loading" class="apartment-photo-panel__skeleton" />
    <div v-else-if="attachments.length || previews.length" ref="gallery" @pointermove="moveDrag" @pointerup="finishDrag" @pointercancel="drag = null" @lostpointercapture="drag = null" @keydown.esc="drag = null">
      <TransitionGroup name="apartment-photo-sort" tag="div" class="apartment-photo-panel__gallery">
      <figure v-for="(attachment, index) in displayedPhotos" :key="attachment.id" class="apartment-photo-panel__item" :class="{ 'apartment-photo-panel__item--placeholder': drag?.moved && drag.id === attachment.id }" :data-apartment-photo-id="attachment.id">
        <button type="button" class="apartment-photo-panel__picture" :disabled="busy || attachments.length < 2" :aria-label="`${t('apartments.photoDrag')}: ${attachment.fileName}`" @pointerdown="startDrag($event, attachment.id)" @keydown.left.prevent="movePhoto(index, -1)" @keydown.right.prevent="movePhoto(index, 1)" @keydown.up.prevent="movePhoto(index, -1)" @keydown.down.prevent="movePhoto(index, 1)">
          <img :src="clientResourceUrl(`/api/attachments/${attachment.id}/file?variant=card`)" :alt="attachment.fileName" class="apartment-photo-panel__image" loading="lazy" decoding="async" draggable="false">
        </button>
        <span v-if="index === 0" class="apartment-photo-panel__main">{{ t('apartments.photoMain') }}</span>
        <UButton color="error" variant="solid" icon="i-lucide-trash-2" size="sm" class="apartment-photo-panel__remove min-h-11 min-w-11 active:scale-[0.96] transition-transform" :disabled="busy" :aria-label="`${t('common.delete')}: ${attachment.fileName}`" @click="emit('removeAttachment', attachment)" />
      </figure>
      <figure v-for="(preview, index) in previews" :key="preview.url" class="apartment-photo-panel__item apartment-photo-panel__item--pending">
        <img :src="preview.url" :alt="preview.file.name" class="apartment-photo-panel__image">
        <UButton color="error" variant="solid" icon="i-lucide-x" size="sm" class="apartment-photo-panel__remove min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="`${t('common.delete')}: ${preview.file.name}`" @click="emit('removePending', index)" />
      </figure>
      </TransitionGroup>
    </div>
    <div v-else class="apartment-photo-panel__empty">
      <UIcon name="i-lucide-image" class="size-8" />
      <span>{{ t('apartments.photo') }}</span>
    </div>
    <Teleport to="body">
      <figure v-if="drag?.moved && draggedPhoto" class="apartment-photo-panel__floating" aria-hidden="true" :style="{ left: `${drag.left}px`, top: `${drag.top}px`, width: `${drag.width}px`, height: `${drag.height}px` }">
        <img :src="clientResourceUrl(`/api/attachments/${draggedPhoto.id}/file?variant=card`)" alt="" class="apartment-photo-panel__image" draggable="false">
      </figure>
    </Teleport>
  </section>
</template>
