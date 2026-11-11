<script setup lang="ts">
import type { MessagingConnection } from '@contracts/messaging'
import { useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, PageHeader } from '#fsd/shared/ui'
import MessagingIntegrationRow from './MessagingIntegrationRow.vue'
import LineConnectionSettings from './LineConnectionSettings.vue'
import TelegramInstructionsModal from './TelegramInstructionsModal.vue'
const { t } = useI18n()
const user = useCurrentUser()
const identity = computed(
  () =>
    `${user.value?.organizationId}:${user.value?.id}:${user.value?.contextRevision}`,
)
const allowed = computed(() =>
  Boolean(
    user.value?.messagingEnabled && user.value.roles.includes('administrator'),
  ),
)
const {
  data,
  error: loadError,
  status: loadStatus,
  refresh,
  clear,
} = await useAsyncData(
  'messaging-connection',
  async () => {
    if (!allowed.value) return null
    const current = identity.value
    const result = await $fetch<MessagingConnection>(
      '/api/messaging/connection',
    )
    return current === identity.value && allowed.value ? result : null
  },
  { server: false, default: () => null, watch: [identity, allowed] },
)
const expandedProvider = ref<'telegram' | 'line' | null>(null)
const telegramStatus = computed(() => {
  if (loadError.value) return t('messaging.integrationLoadError')
  if (!data.value) return t('messaging.loading')
  return t(data.value.connected ? 'messaging.connected' : 'messaging.disconnected')
})
const token = ref('')
const pending = ref(false)
const error = ref('')
const confirmDisconnect = ref(false)
const instructionsOpen = ref(false)
watch([identity, allowed], () => {
  expandedProvider.value = null
  token.value = ''
  error.value = ''
  instructionsOpen.value = false
  data.value = null
  if (!allowed.value) {
    clear()
    void navigateTo('/')
  }
})
async function connect() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  const current = identity.value
  try {
    const result = await $fetch<MessagingConnection>(
      '/api/messaging/connection',
      { method: 'POST', body: { token: token.value } },
    )
    if (identity.value === current && allowed.value) {
      data.value = result
      token.value = ''
    }
  } catch (cause: any) {
    if (identity.value === current)
      error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
async function disconnect() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  const current = identity.value
  try {
    await $fetch('/api/messaging/connection', { method: 'DELETE' })
    if (identity.value === current && allowed.value) {
      confirmDisconnect.value = false
      await refresh()
    }
  } catch (cause: any) {
    if (identity.value === current)
      error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <section v-if="allowed" class="page-wrap space-y-4">
    <PageHeader :title="t('messaging.settings')" />
    <section class="surface" aria-labelledby="message-integrations-title">
      <h2 id="message-integrations-title" class="px-3.5 py-3.5 text-sm font-medium text-[var(--color-muted)]">
        {{ t('integrations.title') }}
      </h2>
      <ul>
        <MessagingIntegrationRow
          name="Telegram"
          icon="i-lucide-send"
          :status="telegramStatus"
          :tone="loadError ? 'error' : data?.connected ? 'success' : undefined"
          :expanded="expandedProvider === 'telegram' && !loadError"
          @update:expanded="expandedProvider = $event ? 'telegram' : null"
        >
          <template v-if="loadError || !data" #action>
            <UButton
              v-if="loadError"
              color="primary"
              variant="ghost"
              icon="i-lucide-rotate-cw"
              class="min-h-11"
              :loading="loadStatus === 'pending'"
              @click="refresh()"
            >{{ t('messaging.retry') }}</UButton>
          </template>
          <UAlert v-if="error && !confirmDisconnect" color="error" role="alert" icon="i-lucide-circle-alert" :description="error" />
          <UButton
            color="primary"
            variant="ghost"
            icon="i-lucide-book-open"
            class="min-h-11"
            @click="instructionsOpen = true"
          >{{ t('messaging.instructions.button') }}</UButton>
          <div v-if="data?.url" class="mb-2 flex flex-wrap items-center gap-x-3">
            <p class="break-all text-sm">{{ data.botName }} · @{{ data.botUsername }}</p>
            <UButton
              :to="data.url"
              target="_blank"
              color="neutral"
              variant="outline"
              icon="i-lucide-external-link"
              class="min-h-11"
              >{{ t('messaging.openBot') }}</UButton
            >
          </div>
          <form class="mt-1" @submit.prevent="connect">
            <div class="flex gap-2">
              <UInput
                v-model="token"
                type="password"
                autocomplete="off"
                class="min-w-0 flex-1"
                :ui="{ base: 'min-h-11' }"
                :placeholder="t('messaging.token')"
                :aria-label="t('messaging.token')"
                aria-describedby="telegram-token-help"
                :disabled="pending"
                required
                maxlength="200"
              />
              <UButton
                type="submit"
                class="min-h-11 shrink-0"
                :loading="pending"
                :disabled="!token.trim() || pending"
              >{{ t('messaging.connect') }}</UButton>
            </div>
            <p id="telegram-token-help" class="mt-2 text-xs text-[var(--color-muted)]">
              {{ t('messaging.botHelp') }}
            </p>
          </form>
          <UButton
            v-if="data?.connected"
            color="neutral"
            variant="outline"
            class="mt-2 min-h-11"
            :disabled="pending"
            @click="confirmDisconnect = true"
          >{{ t('messaging.disconnect') }}</UButton>
        </MessagingIntegrationRow>
        <LineConnectionSettings
          :key="identity"
          :expanded="expandedProvider === 'line'"
          @update:expanded="expandedProvider = $event ? 'line' : null"
        />
        <MessagingIntegrationRow name="WhatsApp" icon="i-lucide-message-circle" :status="t('messaging.integrationExample')" />
        <MessagingIntegrationRow name="Viber" icon="i-lucide-phone" :status="t('messaging.integrationExample')" />
      </ul>
    </section>
    <TelegramInstructionsModal v-model:open="instructionsOpen" />
    <ConfirmActionModal
      v-model:open="confirmDisconnect"
      :title="t('messaging.disconnectTitle')"
      :description="t('messaging.disconnectHelp')"
      :confirm-label="t('messaging.disconnect')"
      :loading="pending"
      :error="error"
      @confirm="disconnect"
    />
  </section>
</template>
