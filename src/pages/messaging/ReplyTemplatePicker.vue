<script setup lang="ts">
import { renderBookingTemplate, type BookingTemplateField, type MessagingTemplate } from '@contracts/messaging-template'

const props = defineProps<{
  disabled: boolean
  draft: string
  limit: number
  values: Partial<Record<BookingTemplateField, string>>
  hasBooking: boolean
}>()
const emit = defineEmits<{ insert: [text: string] }>()
const { t, locale } = useI18n()
const fieldList = computed(() => new Intl.ListFormat(locale.value))
const open = ref(false)
const loading = ref(false)
const error = ref(false)
const templates = ref<MessagingTemplate[]>([])
const query = ref('')
const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return templates.value.filter(template => template.name.toLocaleLowerCase().includes(term)).map(template => {
    const { text: rendered, missing } = renderBookingTemplate(template.text, props.values)
    const draft = props.draft.trimEnd()
    const inserted = missing.length ? null : draft ? `${draft}\n\n${rendered}` : rendered
    return { ...template, rendered, missing, inserted }
  })
})

async function load() {
  if (loading.value) return
  loading.value = true
  error.value = false
  try {
    templates.value = await $fetch<MessagingTemplate[]>('/api/messaging/templates')
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(open, value => {
  if (!value) return
  query.value = ''
  void load()
})

function insert(text: string | null) {
  if (props.disabled || text === null || text.length > props.limit) return
  emit('insert', text)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="t('messaging.templates.title')">
    <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-file-text" :disabled="disabled">
      {{ t('messaging.templates.picker') }}
    </UButton>
    <template #body>
      <p v-if="loading" class="text-sm" role="status">{{ t('messaging.loading') }}</p>
      <div v-else-if="error" class="flex flex-wrap items-center gap-2">
        <p class="text-sm" role="alert">{{ t('messaging.integrationLoadError') }}</p>
        <UButton variant="ghost" @click="load">{{ t('messaging.retry') }}</UButton>
      </div>
      <p v-else-if="!templates.length" class="text-sm">{{ t('messaging.templates.empty') }}</p>
      <div v-else class="space-y-2">
        <UInput
          v-if="templates.length > 5"
          v-model="query"
          icon="i-lucide-search"
          :placeholder="t('messaging.templates.search')"
          :aria-label="t('messaging.templates.search')"
        />
        <p v-if="!matches.length" class="text-sm">{{ t('messaging.templates.noResults') }}</p>
        <ul v-else class="divide-y divide-[var(--color-line)]">
          <li v-for="template in matches" :key="template.id" class="py-1">
            <UButton
              type="button" color="neutral" variant="ghost"
              class="w-full justify-start text-start"
              :disabled="disabled || template.inserted === null || template.inserted.length > limit"
              @click="insert(template.inserted)"
            >
              <span class="min-w-0">
                <span class="block">{{ template.name }}</span>
                <span class="block line-clamp-2 whitespace-pre-line font-normal text-[var(--color-muted)]">{{ template.rendered }}</span>
              </span>
            </UButton>
            <p v-if="template.inserted === null" class="px-2 text-xs text-[var(--color-muted)]">
              {{ !hasBooking && template.missing.some(field => field !== 'guestName')
                ? t('messaging.templates.missingBooking')
                : t('messaging.templates.missingFields', { fields: fieldList.format(template.missing.map(field => t(`messaging.templates.${field}`))) }) }}
            </p>
            <p v-else-if="template.inserted.length > limit" class="px-2 text-xs text-[var(--color-muted)]">
              {{ t('messaging.templates.tooLong') }}
            </p>
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
