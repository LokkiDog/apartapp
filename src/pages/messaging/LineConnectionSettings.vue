<script setup lang="ts">
import type { LineConnection } from '@contracts/messaging'
import { ConfirmActionModal } from '#fsd/shared/ui'
import LineInstructionsModal from './LineInstructionsModal.vue'
import MessagingIntegrationRow from './MessagingIntegrationRow.vue'

const expanded = defineModel<boolean>('expanded', { required: true })
const { t } = useI18n()
const endpoint = '/api/messaging/line/connection'
const connection = ref<LineConnection | null>(null)
const token = ref('')
const secret = ref('')
const saving = ref(false)
const checking = ref(false)
const confirmDisconnect = ref(false)
const instructionsOpen = ref(false)
const error = ref('')
const loadError = ref(false)
const status = computed(() => {
  if (loadError.value) return t('messaging.integrationLoadError')
  if (!connection.value) return t('messaging.loading')
  if (connection.value.connected) return t('messaging.connected')
  return t(connection.value.pending ? 'messaging.line.pending' : 'messaging.disconnected')
})
const copied = ref(false)
let disposed = false

async function check() {
  if (checking.value || saving.value) return
  checking.value = true
  error.value = ''
  try {
    const result = await $fetch<LineConnection>(endpoint)
    if (!disposed) {
      connection.value = result
      loadError.value = false
    }
  } catch {
    if (!disposed) {
      if (connection.value) error.value = t('messaging.integrationLoadError')
      else loadError.value = true
    }
  } finally {
    checking.value = false
  }
}

onMounted(check)
onBeforeUnmount(() => { disposed = true })

async function save(method: 'POST' | 'DELETE') {
  if (saving.value || checking.value) return
  saving.value = true
  error.value = ''
  copied.value = false
  try {
    connection.value = await $fetch<LineConnection>(endpoint, {
      method,
      body: method === 'POST' ? { token: token.value, secret: secret.value } : undefined,
    })
    token.value = ''
    secret.value = ''
    confirmDisconnect.value = false
  } catch (cause) {
    error.value = (cause as { data?: { statusMessage?: string } }).data?.statusMessage || t('common.error')
  } finally {
    saving.value = false
  }
}

async function copyWebhook() {
  if (!connection.value?.webhookUrl) return
  try {
    await navigator.clipboard.writeText(connection.value.webhookUrl)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <MessagingIntegrationRow
    v-model:expanded="expanded"
    name="LINE"
    icon="i-lucide-message-square"
    :status="status"
    :tone="loadError ? 'error' : connection?.connected ? 'success' : undefined"
  >
    <template v-if="!connection" #action>
      <UButton
        v-if="loadError"
        color="primary"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        class="min-h-11"
        :loading="checking"
        @click="check"
      >{{ t('messaging.retry') }}</UButton>
    </template>
    <template v-if="connection">
      <UAlert v-if="error && !confirmDisconnect" color="error" role="alert" icon="i-lucide-circle-alert" :description="error" />
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-book-open"
        class="min-h-11"
        @click="instructionsOpen = true"
      >{{ t('messaging.instructions.button') }}</UButton>
      <LineInstructionsModal v-model:open="instructionsOpen" />
      <p v-if="connection.botName" class="text-sm">
        {{ connection.botName }} · {{ connection.botUsername }}
      </p>
      <form
        v-if="!connection.connected && !connection.pending"
        class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        @submit.prevent="save('POST')"
      >
        <UInput
          v-model="token"
          type="password"
          autocomplete="off"
          placeholder="Channel Access Token"
          aria-label="Channel Access Token"
          :maxlength="2048"
          :ui="{ base: 'min-h-11' }"
          :disabled="saving"
          required
        />
        <UInput
          v-model="secret"
          type="password"
          autocomplete="off"
          placeholder="Channel Secret"
          aria-label="Channel Secret"
          :maxlength="32"
          :ui="{ base: 'min-h-11' }"
          :disabled="saving"
          required
        />
        <UButton
          type="submit"
          class="min-h-11 justify-center"
          :loading="saving"
          :disabled="!token.trim() || !secret.trim() || saving"
        >{{ t('messaging.connect') }}</UButton>
      </form>
      <p v-if="!connection.connected && !connection.pending" class="text-xs text-[var(--color-muted)]">
        {{ t('messaging.line.credentialsHelp') }}
      </p>
      <template v-if="connection.webhookUrl">
        <UFormField label="Webhook URL">
          <div class="flex gap-2">
            <UInput
              :model-value="connection.webhookUrl"
              readonly
              class="min-w-0 flex-1"
              :ui="{ base: 'min-h-11' }"
            />
            <UButton color="neutral" variant="outline" class="min-h-11 shrink-0" @click="copyWebhook">
              {{ t(copied ? 'common.copied' : 'common.copy') }}
            </UButton>
          </div>
        </UFormField>
        <p class="text-xs text-[var(--color-muted)]">{{ t('messaging.line.webhookHelp') }}</p>
      </template>
      <div v-if="connection.connected || connection.pending" class="flex flex-wrap gap-2">
        <UButton
          v-if="connection.pending"
          variant="soft"
          class="min-h-11"
          :loading="checking"
          @click="check"
        >{{ t('messaging.line.check') }}</UButton>
        <UButton
          v-if="connection.connected && connection.url"
          :to="connection.url"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="outline"
          icon="i-lucide-external-link"
          class="min-h-11"
        >{{ t('messaging.line.open') }}</UButton>
        <UButton color="neutral" variant="outline" class="min-h-11" :disabled="checking || saving" @click="confirmDisconnect = true">
          {{ t('messaging.disconnect') }}
        </UButton>
      </div>
    </template>
    <ConfirmActionModal
      v-model:open="confirmDisconnect"
      :title="t('messaging.line.disconnectTitle')"
      :description="t('messaging.line.disconnectHelp')"
      :confirm-label="t('messaging.disconnect')"
      :loading="saving"
      :error="error"
      @confirm="save('DELETE')"
    />
  </MessagingIntegrationRow>
</template>
