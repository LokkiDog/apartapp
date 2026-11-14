<script setup lang="ts">
import type { MessagingConversation } from '@contracts/messaging'

const props = defineProps<{ contact: Pick<MessagingConversation, 'channel' | 'name' | 'username'> }>()
const label = computed(() => props.contact.channel === 'telegram' ? 'Telegram' : 'LINE')
const value = computed(() => props.contact.channel === 'telegram' && props.contact.username
  ? `@${props.contact.username}`
  : props.contact.name)
</script>

<template>
  <UFormField :label="label">
    <UInput
      :model-value="value"
      readonly
      :icon="contact.channel === 'telegram' ? 'i-lucide-send' : 'i-lucide-message-circle'"
      class="w-full"
      :ui="{ base: 'min-h-11' }"
      dir="auto"
    />
  </UFormField>
</template>
