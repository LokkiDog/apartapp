<script setup lang="ts">
import { GuestDirectoryPicker } from '#fsd/features/guest-form'
import type { GuestSummary } from '@contracts/guests'

const props = defineProps<{ conversationId: string; scope: string }>()
const emit = defineEmits<{ saved: [guest: GuestSummary] }>()
const open = defineModel<boolean>('open', { required: true })

function saveGuest(guest: GuestSummary) {
  return $fetch<GuestSummary>(`/api/messaging/conversations/${props.conversationId}/guest`, {
    method: 'POST',
    body: { action: 'link', guestId: guest.id },
  })
}
</script>

<template>
  <GuestDirectoryPicker v-model:open="open" :picker-key="`conversation-${scope}-${conversationId}`" :save-guest="saveGuest" @saved="emit('saved', $event)">
    <slot />
  </GuestDirectoryPicker>
</template>
