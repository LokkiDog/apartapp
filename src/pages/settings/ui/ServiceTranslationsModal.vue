<script setup lang="ts">
import { translationLocales, type NameTranslations } from '#shared/utils/localized-name'

const props = defineProps<{ name: string; translations: NameTranslations }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ apply: [translations: NameTranslations] }>()
const { t } = useI18n()
const draft = reactive({ ru: '', en: '', he: '' })
const languageNames = { ru: 'Русский', en: 'English', he: 'עברית' }
const loading = ref(false)
const errorKey = ref('')
let request: AbortController | undefined

watch(open, value => {
  request?.abort()
  loading.value = false
  errorKey.value = ''
  if (!value) return
  Object.assign(draft, { ru: '', en: '', he: '' }, props.translations)
  if (!Object.values(props.translations).some(value => value?.trim())) void translate()
})
onBeforeUnmount(() => request?.abort())

async function translate() {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const name = props.name.trim()
  loading.value = true
  errorKey.value = ''
  try {
    const result = await $fetch<{ nameTranslations: NameTranslations }>('/api/special-services/translate', {
      method: 'POST', body: { name }, signal: controller.signal
    })
    if (!controller.signal.aborted && open.value && props.name.trim() === name) Object.assign(draft, result.nameTranslations)
  } catch (cause: any) {
    if (controller.signal.aborted) return
    const code = cause?.data?.data?.code
    errorKey.value = code === 'TRANSLATION_NOT_CONFIGURED' ? 'services.translationNotConfigured'
      : code === 'TRANSLATION_MONTHLY_LIMIT' ? 'services.translationMonthlyLimit'
      : code === 'TRANSLATION_LIMIT_INVALID' ? 'services.translationLimitInvalid'
      : code === 'TRANSLATION_RATE_LIMIT' ? 'services.translationRateLimit' : 'services.translationFailed'
  } finally {
    if (request === controller) loading.value = false
  }
}
function apply() {
  emit('apply', Object.fromEntries(translationLocales.map(language => [language, draft[language].trim()])))
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="t('services.translations')" :description="t('services.translationsDescription')">
    <template #body>
      <div class="space-y-4" :aria-busy="loading">
        <p class="break-words text-sm text-[var(--color-muted)]">{{ name }}</p>
        <UAlert v-if="errorKey" color="warning" variant="soft" :description="t(errorKey)" />
        <p v-if="loading" role="status" class="text-sm text-[var(--color-muted)]">{{ t('services.translating') }}</p>
        <UFormField v-for="language in translationLocales" :key="language" :label="languageNames[language]">
          <UInput v-model="draft[language]" :aria-label="languageNames[language]" :lang="language" :dir="language === 'he' ? 'rtl' : 'ltr'" :maxlength="240" :disabled="loading" class="w-full" />
        </UFormField>
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
