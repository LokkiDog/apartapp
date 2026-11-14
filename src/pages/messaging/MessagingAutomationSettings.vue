<script setup lang="ts">
import { messagingAutomationSchema, type MessagingAutomation } from '@contracts/messaging-automation'

type Response = { settings: MessagingAutomation, timezone: string }

const props = defineProps<{ identity: string }>()
const { t, locale } = useI18n()
const toast = useToast()
const { data, error, status, refresh } = useAsyncData(
  computed(() => `messaging-automation-settings:${props.identity}`),
  (_app, { signal }) => $fetch<Response>('/api/messaging/automation', { signal }),
  { server: false, default: () => null },
)
const draft = ref<MessagingAutomation>()
const saving = ref(false)
const saveError = ref(false)
const submitted = ref(false)
const channels = ['telegram', 'line'] as const
const replies = ['welcome', 'away'] as const
type Reply = typeof replies[number]
const texts = reactive<Record<Reply, string>>({ welcome: '', away: '' })
const differentTexts = ref<Reply[]>([])
const weekdays = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) => ({
    label: format.format(new Date(Date.UTC(2024, 0, index + 1))),
    value: String(index + 1),
  }))
})
const workingDays = computed({
  get: () => draft.value?.days.map(String) ?? [],
  set: (days: string[]) => {
    if (draft.value) draft.value.days = days.map(Number)
  },
})
watch(data, value => {
  if (!value) return
  const settings = value.settings
  draft.value = structuredClone(toRaw(settings))
  differentTexts.value = replies.filter(reply => {
    const { telegram, line } = settings
    return Boolean(telegram[reply].text && line[reply].text && telegram[reply].text !== line[reply].text)
  })
  for (const reply of replies) {
    const telegram = settings.telegram[reply]
    const line = settings.line[reply]
    texts[reply] = (telegram.enabled && telegram.text)
      || (line.enabled && line.text)
      || telegram.text
      || line.text
  }
}, { immediate: true })
const validation = computed(() => {
  if (!draft.value) return messagingAutomationSchema.safeParse(undefined)
  const settings = draft.value
  return messagingAutomationSchema.safeParse({
    ...settings,
    telegram: {
      welcome: { ...settings.telegram.welcome, text: texts.welcome },
      away: { ...settings.telegram.away, text: texts.away },
    },
    line: {
      welcome: { ...settings.line.welcome, text: texts.welcome },
      away: { ...settings.line.away, text: texts.away },
    },
  })
})

async function save() {
  submitted.value = true
  if (saving.value || !validation.value.success) return
  saving.value = true
  saveError.value = false
  try {
    data.value = await $fetch<Response>('/api/messaging/automation', {
      method: 'PUT',
      body: validation.value.data,
    })
    submitted.value = false
    toast.add({ title: t('messaging.automation.saved'), color: 'success' })
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="px-3.5 pb-3.5">
    <div v-if="error" class="mt-2 flex flex-wrap items-center gap-2">
      <p class="text-sm" role="alert">{{ t('messaging.integrationLoadError') }}</p>
      <UButton variant="ghost" :loading="status === 'pending'" @click="refresh()">
        {{ t('messaging.retry') }}
      </UButton>
    </div>
    <p v-else-if="!draft" class="mt-2 text-sm" role="status">{{ t('messaging.loading') }}</p>
    <form v-else class="mt-2 space-y-3" @submit.prevent="save">
      <fieldset :disabled="saving" class="min-w-0 space-y-3">
        <fieldset
          v-for="reply in replies"
          :key="reply"
          class="min-w-0 border-b border-[var(--color-line)] pb-2"
        >
          <UFormField :label="t(`messaging.automation.${reply}`)">
            <UTextarea
              v-model="texts[reply]"
              :placeholder="t(`messaging.automation.${reply}Placeholder`)"
              :maxlength="1800"
              :rows="2"
              class="w-full"
              :ui="{ base: 'min-h-16' }"
            />
          </UFormField>
          <div class="flex flex-wrap gap-x-4">
            <UCheckbox
              v-for="channel in channels"
              :key="channel"
              v-model="draft[channel][reply].enabled"
              :label="channel === 'line' ? 'LINE' : 'Telegram'"
              :aria-label="`${t(`messaging.automation.${reply}`)} · ${channel === 'line' ? 'LINE' : 'Telegram'}`"
              :disabled="saving"
            />
          </div>
          <p v-if="differentTexts.includes(reply)" class="text-xs text-[var(--color-muted)]">
            {{ t('messaging.automation.mergeHint') }}
          </p>
          <p v-if="reply === 'away'" class="text-xs text-[var(--color-muted)]">
            {{ t('messaging.automation.lineHint') }}
          </p>
        </fieldset>
        <div class="space-y-2">
          <h3 class="text-sm font-semibold">{{ t('messaging.automation.hours') }} · {{ data?.timezone }}</h3>
          <UCheckboxGroup
            v-model="workingDays"
            :items="weekdays"
            orientation="horizontal"
            :aria-label="t('messaging.automation.days')"
            :ui="{ fieldset: 'flex-wrap' }"
          />
          <div class="grid max-w-sm grid-cols-2 gap-2">
            <UFormField :label="t('messaging.automation.opens')">
              <UInput v-model="draft.opens" type="time" />
            </UFormField>
            <UFormField :label="t('messaging.automation.closes')">
              <UInput v-model="draft.closes" type="time" />
            </UFormField>
          </div>
          <p class="text-xs text-[var(--color-muted)]">{{ t('messaging.automation.hoursHint') }}</p>
        </div>
      </fieldset>
      <UAlert
        v-if="saveError || (submitted && !validation.success)"
        color="error"
        role="alert"
        :description="t(saveError ? 'common.error' : 'messaging.automation.invalid')"
      />
      <UButton type="submit" :loading="saving">{{ t('common.save') }}</UButton>
    </form>
  </div>
</template>
