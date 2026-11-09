<script setup lang="ts">
import type { LineConnection } from '@contracts/messaging'
import { ConfirmActionModal } from '#fsd/shared/ui'

const { t } = useI18n()
const endpoint = '/api/messaging/line/connection'
const connection = ref<LineConnection | null>(null)
const token = ref('')
const secret = ref('')
const saving = ref(false)
const checking = ref(false)
const confirmDisconnect = ref(false)
const error = ref('')
const copied = ref(false)
let disposed = false

async function check() {
  if (checking.value || saving.value) return
  checking.value = true
  error.value = ''
  try {
    const result = await $fetch<LineConnection>(endpoint)
    if (!disposed && !saving.value) connection.value = result
  } catch {
    if (!disposed) error.value = t('common.error')
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
  <section class="surface space-y-2 px-4 pb-4 pt-2" aria-labelledby="line-settings-heading">
    <header class="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
      <div class="flex flex-wrap items-center gap-x-2">
        <h2 id="line-settings-heading" class="text-base font-semibold">LINE</h2>
        <span v-if="connection" class="text-xs text-[var(--color-muted)]">
          {{ t(connection.connected ? 'messaging.connected' : connection.pending ? 'messaging.line.pending' : 'messaging.disconnected') }}
        </span>
      </div>
      <UButton
        to="https://developers.line.biz/console/"
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        icon="i-lucide-external-link"
        class="min-h-11"
      >LINE Developers</UButton>
    </header>
    <UAlert v-if="error && !confirmDisconnect" color="error" :description="error" />
    <UButton v-if="!connection && !checking" variant="soft" class="min-h-11" @click="check">
      {{ t('messaging.retry') }}
    </UButton>
    <template v-if="connection">
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
  </section>
</template>
