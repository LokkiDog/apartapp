<script setup lang="ts">
import type { GuestConversation, GuestConversationList } from '@contracts/guests'

const props = defineProps<{ guestId: string; channel: GuestConversation['channel']; linkedIds: string[] }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const search = ref('')
const query = ref('')
const page = ref(1)
const pending = ref(false)
const error = ref('')
watch(search, (value, _, onCleanup) => {
  const timer = setTimeout(() => { page.value = 1; query.value = value.trim() }, 250)
  onCleanup(() => clearTimeout(timer))
})

const conversationsRoute = '/api/guests/conversations'
const { data, status, refresh } = await useAsyncData(`guest-picker-${props.guestId}-${props.channel ?? 'all'}`, () => {
  return $fetch<GuestConversationList, typeof conversationsRoute>(conversationsRoute, { query: { q: query.value, page: page.value, channel: props.channel } })
}, { server: false, default: () => ({ items: [], hasMore: false }), watch: [query, page] })

async function link(item: GuestConversation) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/guests/${props.guestId}/contact`, { method: 'PATCH', body: { id: item.contactId, linked: true } })
    emit('saved')
  } catch (cause: any) {
    error.value = cause?.data?.data?.code === 'GUEST_MESSAGING_CONFLICT'
      ? t('guests.messagingConflict') : t('common.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <UInput v-model="search" icon="i-lucide-search" maxlength="160" :aria-label="t('guests.findLink')" :placeholder="t('guests.findLink')" class="w-full" :ui="{ base: 'min-h-11' }" />
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <p v-if="status === 'pending' || status === 'idle'" role="status">{{ t('guests.loading') }}</p>
    <UAlert v-else-if="status === 'error'" color="error" variant="soft" :description="t('common.error')" :actions="[{ label: t('guests.retry'), onClick: () => refresh() }]" />
    <ul v-else-if="data?.items.length" class="divide-y divide-[var(--color-line)]">
      <li v-for="item in data.items" :key="item.id" class="flex items-center justify-between gap-3 py-1">
        <div class="min-w-0">
          <p class="break-words font-medium">{{ item.name }}</p>
          <p class="text-sm text-[var(--color-muted)]">{{ item.channel === 'line' ? 'LINE' : 'Telegram' }}<span v-if="item.username"> · @{{ item.username }}</span></p>
          <NuxtLink v-if="item.guestId && item.guestId !== guestId" :to="`/guests/${item.guestId}`" class="inline-flex min-h-11 items-center text-sm underline">{{ t('guests.linkedGuest') }}</NuxtLink>
        </div>
        <UButton
          color="neutral" variant="outline" class="min-h-11 shrink-0"
          :disabled="pending || linkedIds.includes(item.contactId) || Boolean(item.guestId)"
          @click="link(item)"
        >{{ linkedIds.includes(item.contactId) ? t('guests.linked') : t('guests.link') }}</UButton>
      </li>
    </ul>
    <p v-else>{{ t(!query && props.channel ? 'guests.noChannelChats' : 'guests.noResults') }}</p>
    <div v-if="page > 1 || data?.hasMore" class="flex items-center gap-3">
      <UButton class="min-h-11" color="neutral" variant="outline" :disabled="page <= 1 || status === 'pending' || pending" @click="page--">{{ t('guests.previous') }}</UButton>
      <span class="tabular-nums">{{ page }}</span>
      <UButton class="min-h-11" color="neutral" variant="outline" :disabled="!data?.hasMore || status === 'pending' || pending" @click="page++">{{ t('guests.next') }}</UButton>
    </div>
  </div>
</template>
