<script setup lang="ts">
const props = defineProps<{ photos: Array<{ id: string, url: string }>, title: string }>()
const { copy, isRtl } = useSite()
const active = ref(0)
const expanded = ref(false)
const failedPhotos = ref<Record<string, boolean>>({})
const revisions = ref<Record<string, number>>({})
const viewerFailed = ref(false)
const viewerLoading = ref(true)
const viewer = useTemplateRef<HTMLDialogElement>('viewer')
const current = computed(() => props.photos[active.value] ?? props.photos[0])
const preview = computed(() => props.photos.slice(0, 5))
const counter = computed(() => `${active.value + 1} / ${props.photos.length}`)
const alternative = computed(() => `${props.title} — ${copy.value.photo} ${active.value + 1}`)
let trigger: HTMLElement | null = null
function select(index: number) {
  if (!props.photos.length) return
  active.value = (index + props.photos.length) % props.photos.length
  viewerFailed.value = false; viewerLoading.value = true
}
function openViewer(index: number, event: MouseEvent) {
  trigger = event.currentTarget as HTMLElement
  select(index)
  expanded.value = true
  viewer.value?.showModal()
}
function closeViewer() { viewer.value?.close() }
function closed() {
  expanded.value = false
  if (trigger?.isConnected) trigger.focus({ preventScroll: true })
}
function retryPhoto(id: string) {
  failedPhotos.value[id] = false
  revisions.value[id] = (revisions.value[id] ?? 0) + 1
}
function retryViewer() {
  if (current.value) retryPhoto(current.value.id)
  viewerFailed.value = false; viewerLoading.value = true
}
function handleKeys(event: KeyboardEvent) {
  if (props.photos.length < 2) return
  const step = isRtl.value ? -1 : 1
  if (event.key === 'ArrowLeft') { event.preventDefault(); select(active.value - step) }
  if (event.key === 'ArrowRight') { event.preventDefault(); select(active.value + step) }
}
watch(() => props.photos.map(photo => `${photo.id}:${photo.url}`).join(','), () => {
  closeViewer(); active.value = 0; failedPhotos.value = {}; revisions.value = {}
})
onBeforeUnmount(closeViewer)
</script>
<template>
  <section v-if="current" class="gallery" :aria-label="copy.gallery">
    <div class="gallery-mosaic" :class="`gallery-mosaic--${preview.length}`">
      <div v-for="(photo, index) in preview" :key="photo.id" class="gallery-tile">
        <button type="button" class="gallery-tile-open" :aria-label="`${copy.openPhoto}: ${copy.photo} ${index + 1}`" @click="openViewer(index, $event)">
          <img :key="`${photo.id}-${revisions[photo.id] ?? 0}`" :src="photo.url" :alt="`${title} — ${copy.photo} ${index + 1}`" width="800" height="600" :loading="index ? 'lazy' : 'eager'" :fetchpriority="index ? 'auto' : 'high'" @error="failedPhotos[photo.id] = true" @load="failedPhotos[photo.id] = false">
        </button>
        <div v-if="failedPhotos[photo.id]" class="gallery-tile-error" role="status"><p>{{ copy.photoError }}</p><button type="button" @click="retryPhoto(photo.id)">{{ copy.retry }}</button></div>
      </div>
      <button type="button" class="gallery-show-all" @click="openViewer(0, $event)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h6v6h-6z" /></svg>{{ copy.showAllPhotos }}</button>
    </div>
    <dialog ref="viewer" class="photo-viewer" :aria-label="copy.gallery" @keydown.stop="handleKeys" @click.self="closeViewer" @close="closed">
      <div class="photo-viewer-toolbar"><span aria-live="polite" dir="ltr">{{ counter }}</span><button type="button" class="gallery-control" :aria-label="copy.close" autofocus @click="closeViewer">×</button></div>
      <div class="photo-viewer-stage" :aria-busy="viewerLoading && !viewerFailed">
        <img v-if="expanded && !viewerFailed" :key="`${current.id}-${revisions[current.id] ?? 0}`" :src="current.url" :alt="alternative" width="1600" height="1000" @load="viewerLoading = false" @error="viewerFailed = true; viewerLoading = false">
        <div v-if="viewerFailed" class="photo-viewer-error" role="status"><p>{{ copy.photoError }}</p><button type="button" class="button" @click="retryViewer">{{ copy.retry }}</button></div>
      </div>
      <div v-if="photos.length > 1" class="photo-viewer-navigation">
        <button type="button" class="gallery-control" :aria-label="copy.previousPhoto" @click="select(active - 1)">{{ isRtl ? '→' : '←' }}</button>
        <button type="button" class="gallery-control" :aria-label="copy.nextPhoto" @click="select(active + 1)">{{ isRtl ? '←' : '→' }}</button>
      </div>
    </dialog>
  </section>
</template>
