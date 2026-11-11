<script setup lang="ts">
import { publicationInputSchema, publicCopyFields, type PublicationInput } from '@contracts/publication'
import PublicationTranslationsModal from './PublicationTranslationsModal.vue'
import PublicationAmenityPicker from './PublicationAmenityPicker.vue'
import { useI18n } from 'vue-i18n'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, useSubmitFormValidation } from '#fsd/shared/lib'

const props = defineProps<{ apartmentId: string, apartmentStatus: string, photos: Array<{ id: string, fileName: string }> }>()
const currentUser = useCurrentUser()
const { t } = useI18n()
const validation = useSubmitFormValidation()
const validate = createFormValidator(publicationInputSchema, t)
const { data: siteSettings } = await useAsyncData('publication-site-settings', () => currentUser.value?.roles.includes('administrator') ? $fetch<import('@contracts/public-site').PublicSiteSettings>('/api/public-site') : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] })
const open = defineModel<boolean>('open', { default: false })
const draft = ref<PublicationInput | null>(null)
const pending = ref(false)
const translationsOpen = ref(false)
const hasSourceCopy = computed(() => Boolean(draft.value && publicCopyFields.some(field => draft.value!.translations.ru[field].trim())))
const publicationDisabled = computed(() => props.apartmentStatus !== 'active' || !props.photos.length || pending.value)
const message = ref('')
const failure = ref('')
const { data, status, error, refresh } = await useAsyncData(`publication-${props.apartmentId}`, () => currentUser.value?.roles.includes('administrator') ? $fetch<PublicationInput>(`/api/apartments/${props.apartmentId}/publication`) : Promise.resolve(null), { server: false, default: () => null, watch: [currentUser] })
watch(data, value => { draft.value = value ? structuredClone(toRaw(value)) : null }, { immediate: true })
watch(() => props.apartmentStatus, () => { void refresh() })
watch(() => props.photos.length, count => {
  if (!count) {
    if (draft.value) draft.value.published = false
    if (data.value) data.value.published = false
  }
})
watch(open, value => { if (!value) translationsOpen.value = false })
watch(() => draft.value?.translations.ru, (value, previous) => {
  if (draft.value && value === previous) {
    for (const language of ['en', 'he', 'bg'] as const) delete draft.value.translations[language]
    translationsOpen.value = false
  }
}, { deep: true })
const publicUrl = computed(() => siteSettings.value?.settings.enabled && siteSettings.value.settings.websiteUrl ? `${siteSettings.value.settings.websiteUrl}/apartments/${data.value?.slug}` : '')
watch(open, value => {
  if (value) {
    validation.reset()
    draft.value = data.value ? structuredClone(toRaw(data.value)) : null
    failure.value = ''; message.value = ''
  }
})
async function save() {
  if (pending.value) return
  failure.value = ''; message.value = ''
  if (draft.value?.published && !props.photos.length) { failure.value = t('publication.noPhotos'); return }
  const parsed = publicationInputSchema.safeParse(draft.value ? { ...draft.value, photoIds: [] } : null)
  if (!parsed.success) { failure.value = t('publication.validationError'); return }
  pending.value = true
  try {
    await $fetch(`/api/apartments/${props.apartmentId}/publication`, { method: 'PUT', body: parsed.data })
    await refresh()
    validation.reset()
    message.value = t('publication.saved')
  } catch (cause: any) { failure.value = cause?.data?.statusMessage || t('common.error') }
  finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('publication.configure')" :dismissible="!pending" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <USkeleton v-if="status === 'pending' || status === 'idle'" class="h-52" />
      <UAlert v-else-if="error" color="error" orientation="horizontal" role="alert" :description="t('publication.loadError')"><template #actions><UButton color="error" variant="ghost" @click="refresh()">{{ t('publication.retry') }}</UButton></template></UAlert>
      <UForm v-else-if="draft" :key="validation.formKey.value" :id="`publication-form-${apartmentId}`" :state="draft" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="publication-form" @error="validation.onError" @submit="save">
        <USwitch
          v-model="draft.published"
          size="xl"
          class="min-h-11 items-center"
          :disabled="publicationDisabled"
          :label="t('publication.visible')"
          :ui="{
            container: 'min-h-11',
            base: 'relative before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2',
            label: ['flex min-h-11 items-center', publicationDisabled ? 'cursor-not-allowed' : 'cursor-pointer'].join(' ')
          }"
        />
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField name="translations.ru.title" :label="t('publication.name')" required><UInput v-model="draft.translations.ru.title" :required="draft.published" :maxlength="160" class="w-full" /></UFormField>
          <UFormField name="slug" :label="t('publication.slug')" required><UInput v-model="draft.slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required class="w-full" /></UFormField>
          <UFormField name="translations.ru.summary" :label="t('publication.summary')" required class="md:col-span-2"><UTextarea v-model="draft.translations.ru.summary" :required="draft.published" :maxlength="400" class="w-full" /></UFormField>
          <UFormField name="translations.ru.description" :label="t('publication.description')" required class="md:col-span-2"><UTextarea v-model="draft.translations.ru.description" :required="draft.published" :maxlength="12000" :rows="6" class="w-full" /></UFormField>
          <UFormField name="translations.ru.location" :label="t('publication.location')" class="md:col-span-2"><UTextarea v-model="draft.translations.ru.location" :maxlength="2000" class="w-full" /></UFormField>
          <UFormField name="sortOrder" :label="t('publication.order')"><UInput v-model.number="draft.sortOrder" type="number" min="0" max="100000" class="w-full" /></UFormField>
        </div>
        <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-languages" class="min-h-11 justify-self-start" :disabled="pending || !hasSourceCopy" @click="translationsOpen = true">{{ t('services.viewTranslations') }}</UButton>
        <PublicationAmenityPicker v-model="draft.amenities" />
        <p class="text-sm text-[var(--color-muted)]">{{ t(photos.length ? 'publication.allPhotosHint' : 'publication.noPhotos') }}</p>
        <UAlert v-if="failure" color="error" :description="failure" /><UAlert v-if="message" color="success" :description="message" />
      </UForm>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer flex-wrap w-full">
        <UButton color="neutral" variant="ghost" class="min-h-11" :disabled="pending" @click="open = false">{{ t('common.cancel') }}</UButton>
        <UButton v-if="data?.published && publicUrl" :to="publicUrl" target="_blank" color="neutral" variant="outline" class="min-h-11">{{ t('publication.openSite') }}</UButton>
        <UButton type="submit" :form="`publication-form-${apartmentId}`" :loading="pending" :disabled="pending || !draft || Boolean(error) || status !== 'success'" class="min-h-11">{{ t('publication.save') }}</UButton>
      </div>
    </template>
  </UModal>
  <PublicationTranslationsModal v-if="draft" v-model:open="translationsOpen" :apartment-id="apartmentId" :source="draft.translations.ru" :translations="draft.translations" @apply="Object.assign(draft.translations, $event)" />
</template>

<style scoped>
.publication-form { display: grid; gap: 1.25rem; }
</style>
