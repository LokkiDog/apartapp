<script setup lang="ts">
import type { MessagingChannel } from '@contracts/messaging'

const props = defineProps<{ channel: MessagingChannel }>()
const { t } = useI18n()
const toast = useToast()
const pending = ref(false)
const failed = ref(false)

async function requestSetup() {
  if (pending.value) return
  pending.value = true
  failed.value = false
  try {
    const result = await $fetch('/api/messaging/setup-request', {
      method: 'POST',
      body: { channel: props.channel },
    })
    toast.add({
      color: 'success',
      title: t(result.alreadyRequested ? 'messaging.setupRequest.existing' : 'messaging.setupRequest.sent'),
    })
  } catch {
    failed.value = true
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="min-w-0">
    <UButton
      color="warning"
      variant="soft"
      class="min-h-11"
      :loading="pending"
      @click="requestSetup"
    >{{ t('messaging.setupRequest.button') }}</UButton>
    <UAlert v-if="failed" color="error" role="alert" class="mt-1.5" :description="t('messaging.setupRequest.error')" />
  </div>
</template>
