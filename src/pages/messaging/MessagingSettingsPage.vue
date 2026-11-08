<script setup lang="ts">
import type { MessagingConnection } from '@contracts/messaging'
import { useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, PageHeader } from '#fsd/shared/ui'
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
const token = ref('')
const pending = ref(false)
const error = ref('')
const confirmDisconnect = ref(false)
watch([identity, allowed], () => {
  token.value = ''
  error.value = ''
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
  <section v-if="allowed" class="space-y-4">
    <PageHeader :title="t('messaging.title')" />
    <UAlert
      v-if="loadError || error"
      color="error"
      :description="error || t('common.error')"
      ><template #actions
        ><UButton variant="soft" color="error" @click="refresh()">{{
          t('messaging.retry')
        }}</UButton></template
      ></UAlert
    >
    <div class="surface p-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">Telegram</h2>
        <span>{{
          t(data?.connected ? 'messaging.connected' : 'messaging.disconnected')
        }}</span>
      </div>
      <template v-if="data?.url">
        <p>{{ data.botName }} · @{{ data.botUsername }}</p>
        <UButton
          :to="data.url"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-lucide-external-link"
          >{{ t('messaging.openBot') }}</UButton
        >
      </template>
      <p class="text-sm text-[var(--color-muted)]">
        {{ t('messaging.botHelp') }}
      </p>
      <form class="space-y-3" @submit.prevent="connect">
        <UFormField :label="t('messaging.token')"
          ><UInput
            v-model="token"
            type="password"
            autocomplete="off"
            class="w-full"
            :disabled="pending"
            required
            maxlength="200"
        /></UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            :loading="pending"
            :disabled="!token.trim() || pending"
            >{{ t('messaging.connect') }}</UButton
          >
          <UButton
            v-if="data?.connected"
            color="neutral"
            variant="outline"
            :disabled="pending"
            @click="confirmDisconnect = true"
            >{{ t('messaging.disconnect') }}</UButton
          >
        </div>
      </form>
    </div>
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
