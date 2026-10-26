<script setup lang="ts">
import { amenityCodes, publicationInputSchema, type PublicationInput } from '@contracts/publication'
import { useI18n } from 'vue-i18n'
import { useCurrentUser, clientResourceUrl } from '#fsd/shared/auth'

const props = defineProps<{ apartmentId: string, apartmentStatus: string, photos: Array<{ id: string, fileName: string }> }>()
const currentUser = useCurrentUser()
const { t } = useI18n()
const config = useRuntimeConfig()
const open = ref(false)
const draft = ref<PublicationInput | null>(null)
const pending = ref(false)
const message = ref('')
const failure = ref('')
const { data, status, error, refresh } = await useAsyncData(`publication-${props.apartmentId}`, () => currentUser.value?.roles.includes('administrator') ? $fetch<PublicationInput>(`/api/apartments/${props.apartmentId}/publication`) : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] })
watch(data, value => { draft.value = value ? structuredClone(toRaw(value)) : null }, { immediate: true })
watch(() => props.apartmentStatus, () => { void refresh() })
watch(() => props.photos.map(photo => photo.id), ids => {
  if (draft.value) {
    draft.value.photoIds = draft.value.photoIds.filter(id => ids.includes(id))
    if (!draft.value.photoIds.length) draft.value.published = false
  }
  if (data.value) {
    data.value.photoIds = data.value.photoIds.filter(id => ids.includes(id))
    if (!data.value.photoIds.length) data.value.published = false
  }
})
const publicUrl = computed(() => `${config.public.catalogueUrl}/apartments/${data.value?.slug}`)
function togglePhoto(id: string, selected: boolean) {
  if (!draft.value) return
  draft.value.photoIds = selected ? [...draft.value.photoIds, id] : draft.value.photoIds.filter(value => value !== id)
}
function movePhoto(index: number, direction: number) {
  if (!draft.value) return
  const next = index + direction
  if (next < 0 || next >= draft.value.photoIds.length) return
  const ids = [...draft.value.photoIds]
  ;[ids[index], ids[next]] = [ids[next]!, ids[index]!]
  draft.value.photoIds = ids
}
async function save() {
  failure.value = ''; message.value = ''
  const parsed = publicationInputSchema.safeParse(draft.value)
  if (!parsed.success) { failure.value = t('publication.validationError'); return }
  pending.value = true
  try {
    await $fetch(`/api/apartments/${props.apartmentId}/publication`, { method: 'PUT', body: parsed.data })
    await refresh()
    message.value = t('publication.saved')
  } catch (cause: any) { failure.value = cause?.data?.statusMessage || t('common.error') }
  finally { pending.value = false }
}
</script>

<template>
  <section class="surface publication-panel">
    <button type="button" class="publication-heading" :aria-expanded="open" aria-controls="publication-fields" @click="open = !open">
      <span class="flex items-center gap-3"><UIcon name="i-lucide-globe" class="size-5" /><span class="text-lg font-semibold">{{ t('publication.title') }}</span></span>
      <span class="flex items-center gap-3"><span class="text-sm text-[var(--color-muted)]">{{ t(data?.published ? 'publication.live' : 'publication.draft') }}</span><UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" /></span>
    </button>
    <div v-if="open" id="publication-fields" class="mt-5">
      <USkeleton v-if="status === 'pending'" class="h-52" />
      <div v-else-if="error" class="space-y-3"><UAlert color="error" :description="t('publication.loadError')" /><UButton @click="refresh()">{{ t('publication.retry') }}</UButton></div>
      <form v-else-if="draft" class="space-y-5" @submit.prevent="save">
        <USwitch v-model="draft.published" :disabled="apartmentStatus !== 'active'" :label="t('publication.visible')" />
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('publication.name')"><UInput v-model="draft.translations.ru.title" :maxlength="160" class="w-full" /></UFormField>
          <UFormField :label="t('publication.slug')"><UInput v-model="draft.slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required class="w-full" /></UFormField>
          <UFormField :label="t('publication.summary')" class="md:col-span-2"><UTextarea v-model="draft.translations.ru.summary" :maxlength="400" class="w-full" /></UFormField>
          <UFormField :label="t('publication.description')" class="md:col-span-2"><UTextarea v-model="draft.translations.ru.description" :maxlength="12000" :rows="6" class="w-full" /></UFormField>
          <UFormField :label="t('publication.location')" class="md:col-span-2"><UTextarea v-model="draft.translations.ru.location" :maxlength="2000" class="w-full" /></UFormField>
          <UFormField :label="t('publication.order')"><UInput v-model.number="draft.sortOrder" type="number" min="0" max="100000" class="w-full" /></UFormField>
        </div>
        <fieldset><legend class="mb-3 font-medium">{{ t('publication.amenities') }}</legend><div class="grid gap-3 sm:grid-cols-2"><UCheckbox v-for="code in amenityCodes" :key="code" :label="t(`publication.amenity.${code}`)" :model-value="draft.amenities.includes(code)" @update:model-value="value => draft && (draft.amenities = value ? [...draft.amenities, code] : draft.amenities.filter(item => item !== code))" /></div></fieldset>
        <fieldset><legend class="mb-3 font-medium">{{ t('publication.photos') }}</legend>
          <p class="mb-3 text-sm text-[var(--color-muted)]">{{ t('publication.photoHint') }}</p>
          <div class="grid gap-4 sm:grid-cols-3"><div v-for="photo in photos" :key="photo.id" class="publication-photo"><img :src="clientResourceUrl(`/api/attachments/${photo.id}/file?variant=card`)" :alt="photo.fileName" loading="lazy"><UCheckbox :model-value="draft.photoIds.includes(photo.id)" :label="photo.fileName" @update:model-value="value => togglePhoto(photo.id, Boolean(value))" /></div></div>
          <p v-if="!photos.length" class="text-sm text-[var(--color-muted)]">{{ t('publication.noPhotos') }}</p>
          <ol class="mt-4 divide-y divide-[var(--color-line)]"><li v-for="(id, index) in draft.photoIds" :key="id" class="flex items-center gap-2 py-2"><span class="min-w-0 flex-1 truncate text-sm">{{ index === 0 ? t('publication.cover') + ': ' : '' }}{{ photos.find(photo => photo.id === id)?.fileName || t('publication.missingPhoto') }}</span><UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="min-h-11 min-w-11" :aria-label="t('publication.up')" :disabled="index === 0" @click="movePhoto(index, -1)" /><UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="min-h-11 min-w-11" :aria-label="t('publication.down')" :disabled="index === draft.photoIds.length - 1" @click="movePhoto(index, 1)" /></li></ol>
        </fieldset>
        <UAlert v-if="failure" color="error" :description="failure" /><UAlert v-if="message" color="success" :description="message" />
        <div class="form-actions form-actions--footer"><UButton v-if="data?.published" :to="publicUrl" target="_blank" color="neutral" variant="outline" class="min-h-11">{{ t('publication.openSite') }}</UButton><UButton type="submit" :loading="pending" :disabled="pending" class="min-h-11">{{ t('publication.save') }}</UButton></div>
      </form>
    </div>
  </section>
</template>
<style scoped>
.publication-panel { padding: 24px; }
.publication-heading { display:flex; width:100%; min-height:44px; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; border-radius:10px; transition:background-color 150ms; }
.publication-heading:hover { background:var(--color-surface-muted); }
.publication-heading:active { background:var(--color-primary-soft); }
.publication-heading:focus-visible { outline:2px solid var(--color-primary); outline-offset:4px; }
.publication-photo { display:grid; gap:8px; }
.publication-photo img { width:100%; aspect-ratio:2/1; object-fit:cover; border-radius:10px; }
</style>
