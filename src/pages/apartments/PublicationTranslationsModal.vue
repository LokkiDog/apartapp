<script setup lang="ts">
import { publicationTranslationLocales, publicCopyFields, publicCopySchema, type PublicCopy, type PublicationInput, type PublicationTargetTranslations } from '@contracts/publication'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ apartmentId: string; source: PublicCopy; translations: PublicationInput['translations'] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ apply: [translations: PublicationTargetTranslations] }>()
const { t } = useI18n()
const draft = reactive<PublicationTargetTranslations>({ en: publicCopySchema.parse({}), he: publicCopySchema.parse({}), bg: publicCopySchema.parse({}) })
const language = ref<typeof publicationTranslationLocales[number]>('en')
const languageNames = { en: 'English', he: 'עברית', bg: 'Български' }
const languageOptions = publicationTranslationLocales.map(value => ({ label: languageNames[value], value }))
const loading = ref(false)
const errorKey = ref('')
let request: AbortController | undefined

watch(open, value => {
  request?.abort()
  loading.value = false; errorKey.value = ''
  if (!value) return
  language.value = 'en'
  for (const target of publicationTranslationLocales) Object.assign(draft[target], publicCopySchema.parse(props.translations[target] ?? {}))
  if (!publicationTranslationLocales.some(target => publicCopyFields.some(field => draft[target][field].trim()))) void translate()
})
watch(() => JSON.stringify(props.source), () => { if (open.value) open.value = false })
onBeforeUnmount(() => request?.abort())

async function translate() {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const source = structuredClone(toRaw(props.source))
  const fingerprint = JSON.stringify(source)
  loading.value = true; errorKey.value = ''
  try {
    const result = await $fetch<{ translations: PublicationTargetTranslations }>(`/api/apartments/${props.apartmentId}/publication/translate`, {
      method: 'POST', body: { source }, signal: controller.signal
    })
    if (!controller.signal.aborted && open.value && JSON.stringify(props.source) === fingerprint) {
      for (const target of publicationTranslationLocales) Object.assign(draft[target], result.translations[target])
    }
  } catch (cause: any) {
    if (controller.signal.aborted) return
    const code = cause?.data?.data?.code
    errorKey.value = code === 'TRANSLATION_NOT_CONFIGURED' ? 'services.translationNotConfigured'
      : code === 'TRANSLATION_MONTHLY_LIMIT' ? 'services.translationMonthlyLimit'
      : code === 'TRANSLATION_LIMIT_INVALID' ? 'services.translationLimitInvalid'
      : code === 'TRANSLATION_RATE_LIMIT' ? 'services.translationRateLimit' : 'publication.translationFailed'
  } finally { if (request === controller) loading.value = false }
}
function apply() {
  emit('apply', structuredClone(toRaw(draft)))
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="t('services.translations')" :description="t('publication.translationsDescription')" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="space-y-4" :aria-busy="loading">
        <USelect v-model="language" :items="languageOptions" :aria-label="t('publication.translationLanguage')" class="min-h-11 w-full" />
        <UAlert v-if="errorKey" color="error" role="alert" :description="t(errorKey)" />
        <p v-if="loading" role="status" class="text-sm text-[var(--color-muted)]">{{ t('services.translating') }}</p>
        <div :lang="language" :dir="language === 'he' ? 'rtl' : 'ltr'" class="grid gap-4">
          <UFormField :label="t('publication.name')"><UInput v-model="draft[language].title" :maxlength="160" :disabled="loading" class="w-full" /></UFormField>
          <UFormField :label="t('publication.summary')"><UTextarea v-model="draft[language].summary" :maxlength="400" :disabled="loading" class="w-full" /></UFormField>
          <UFormField :label="t('publication.description')"><UTextarea v-model="draft[language].description" :maxlength="12000" :rows="6" :disabled="loading" class="w-full" /></UFormField>
          <UFormField :label="t('publication.location')"><UTextarea v-model="draft[language].location" :maxlength="2000" :disabled="loading" class="w-full" /></UFormField>
        </div>
        <UButton type="button" color="neutral" variant="soft" icon="i-lucide-languages" class="min-h-11" :loading="loading" @click="translate">{{ t('services.translateAgain') }}</UButton>
      </div>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer w-full">
        <UButton type="button" color="neutral" variant="ghost" class="min-h-11" @click="open = false">{{ t('common.cancel') }}</UButton>
        <UButton type="button" class="min-h-11" :disabled="loading" @click="apply">{{ t('services.applyTranslations') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
