<script setup lang="ts">
import type { LineConnection, LineMessageQuota } from '@contracts/messaging'
import { ConfirmActionModal } from '#fsd/shared/ui'
import LineInstructionsModal from './LineInstructionsModal.vue'
import MessagingIntegrationRow from './MessagingIntegrationRow.vue'

const expanded = defineModel<boolean>('expanded', { required: true })
const { t, n } = useI18n()
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

const quota = ref<LineMessageQuota | null>(null)
const quotaError = ref(false)
const quotaVisible = computed(() => expanded.value && connection.value?.connected === true)
const quotaText = computed(() => {
  if (quotaError.value) return t('messaging.line.quotaUnavailable')
  const result = quota.value
  if (!result) return t('messaging.loading')
  if (result.limit === null) return t('messaging.line.quotaNoLimit', { used: n(result.used) })
  return t('messaging.line.quotaRemaining', {
    remaining: n(Math.max(0, result.limit - result.used)),
    limit: n(result.limit),
  })
})

watch(quotaVisible, async (visible, _, onCleanup) => {
  quota.value = null
  quotaError.value = false
  if (!visible) return
  const request = new AbortController()
  onCleanup(() => request.abort())
  try {
    const result = await $fetch<LineMessageQuota>('/api/messaging/line/quota', { signal: request.signal })
    if (!request.signal.aborted) quota.value = result
  } catch {
    if (!request.signal.aborted) quotaError.value = true
  }
})

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
      <div
        v-if="connection.connected"
        class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]"
        role="status"
      >
        <span>{{ t('messaging.line.quotaLabel') }}</span>
        <span class="font-medium tabular-nums" :class="{ 'text-[var(--color-ink)]': quota }">
          {{ quotaText }}
        </span>
      </div>
      <LineInstructionsModal v-model:open="instructionsOpen" />
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
      <div class="flex flex-wrap items-end gap-x-3 gap-y-1">
        <UFormField
          v-if="connection.webhookUrl"
          label="Webhook URL"
          size="sm"
          :ui="{ label: 'min-w-0', container: 'mt-0.5' }"
          class="min-w-0 basis-full lg:flex-[1_1_16rem]"
        >
          <template #label="{ label }">
            <span class="flex min-w-0 items-baseline gap-2">
              <span class="shrink-0">{{ label }}</span>
              <span v-if="connection.botName" class="truncate text-xs font-normal text-[var(--color-muted)]">
                {{ [connection.botName, connection.botUsername].filter(Boolean).join(' · ') }}
              </span>
            </span>
          </template>
          <div class="flex gap-1">
            <UInput
              :model-value="connection.webhookUrl"
              size="sm"
              dir="ltr"
              readonly
              class="min-w-0 flex-1"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              :aria-label="t(copied ? 'common.copied' : 'common.copy')"
              :title="t(copied ? 'common.copied' : 'common.copy')"
              class="min-w-11 shrink-0 justify-center"
              @click="copyWebhook"
            />
            <span class="sr-only" role="status">{{ copied ? t('common.copied') : '' }}</span>
          </div>
        </UFormField>
        <div class="flex min-w-0 flex-wrap gap-1">
          <UButton
            v-if="connection.pending"
            variant="soft"
            size="sm"
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
            size="sm"
          >{{ t('messaging.line.open') }}</UButton>
          <UButton
            v-if="connection.connected || connection.pending"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="checking || saving"
            @click="confirmDisconnect = true"
          >{{ t('messaging.disconnect') }}</UButton>
          <UButton
            color="primary"
            variant="ghost"
            icon="i-lucide-book-open"
            size="sm"
            @click="instructionsOpen = true"
          >{{ t('messaging.instructions.button') }}</UButton>
        </div>
      </div>
      <p v-if="connection.pending && connection.webhookUrl" class="text-xs text-[var(--color-muted)]">
        {{ t('messaging.line.webhookHelp') }}
      </p>
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
