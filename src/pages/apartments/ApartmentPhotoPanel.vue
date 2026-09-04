<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export type ApartmentPhotoAttachment = { id: string; fileName: string }

const props = withDefaults(defineProps<{
  attachments?: ApartmentPhotoAttachment[]
  pendingPhotos?: File[]
  loading?: boolean
  uploading?: boolean
}>(), {
  attachments: () => [],
  pendingPhotos: () => [],
  loading: false,
  uploading: false
})

const emit = defineEmits<{
  select: [files: File[]]
  removePending: [index: number]
  removeAttachment: [attachment: ApartmentPhotoAttachment]
  invalidFiles: []
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
</script>

<template>
  <section class="apartment-photo-panel surface">
    <div class="apartment-photo-panel__header">
      <div>
        <h2 class="text-lg font-semibold">{{ t('apartments.photo') }}</h2>
        <p class="mt-1 text-sm text-[var(--color-muted)]">{{ t('apartments.photoHint') }}</p>
      </div>
      <input ref="input" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple @change="selectPhotos">
      <UButton color="neutral" variant="soft" icon="i-lucide-camera" class="min-h-11 transition-transform duration-150 ease-out active:scale-[0.96]" :loading="uploading" @click="choosePhotos">
        {{ t('common.addPhoto') }}
      </UButton>
    </div>

    <USkeleton v-if="loading" class="apartment-photo-panel__skeleton" />
    <div v-else-if="attachments.length || previews.length" class="apartment-photo-panel__gallery">
      <figure v-for="attachment in attachments" :key="attachment.id" class="apartment-photo-panel__item">
        <img :src="`/api/attachments/${attachment.id}/file?variant=card`" :alt="attachment.fileName" class="apartment-photo-panel__image" loading="lazy" decoding="async">
        <UButton color="error" variant="solid" icon="i-lucide-trash-2" size="sm" class="apartment-photo-panel__remove min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="`${t('common.delete')}: ${attachment.fileName}`" @click="emit('removeAttachment', attachment)" />
      </figure>
      <figure v-for="(preview, index) in previews" :key="preview.url" class="apartment-photo-panel__item apartment-photo-panel__item--pending">
        <img :src="preview.url" :alt="preview.file.name" class="apartment-photo-panel__image">
        <UButton color="error" variant="solid" icon="i-lucide-x" size="sm" class="apartment-photo-panel__remove min-h-11 min-w-11 active:scale-[0.96] transition-transform" :aria-label="`${t('common.delete')}: ${preview.file.name}`" @click="emit('removePending', index)" />
      </figure>
    </div>
    <div v-else class="apartment-photo-panel__empty">
      <UIcon name="i-lucide-image" class="size-8" />
      <span>{{ t('apartments.photo') }}</span>
    </div>
  </section>
</template>
