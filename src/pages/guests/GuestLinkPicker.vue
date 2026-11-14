<script setup lang="ts">
import type { GuestConversation, GuestStay } from '@contracts/guests'
import { formatDate } from '#fsd/shared/lib'

const props = defineProps<{ guestId: string; kind: 'stay' | 'contact'; channel?: GuestConversation['channel']; linkedIds: string[] }>()
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

const { data, status, refresh } = await useAsyncData(`guest-picker-${props.guestId}-${props.kind}-${props.channel ?? 'all'}`, async () => {
  const parameters = { query: { q: query.value, page: page.value } }
  return props.kind === 'stay' ? $fetch('/api/guests/stays', parameters) : $fetch('/api/guests/conversations', { query: { ...parameters.query, channel: props.channel } })
}, { server: false, default: () => ({ items: [], hasMore: false }), watch: [query, page] })

function isContact(item: GuestConversation | GuestStay): item is GuestConversation {
  return 'contactId' in item
}

async function link(item: GuestConversation | GuestStay) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const id = isContact(item) ? item.contactId : item.id
    await $fetch(`/api/guests/${props.guestId}/${props.kind}`, { method: 'PATCH', body: { id, linked: true } })
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
        <div v-if="isContact(item)" class="min-w-0">
          <p class="break-words font-medium">{{ item.name }}</p>
          <p class="text-sm text-[var(--color-muted)]">{{ item.channel === 'line' ? 'LINE' : 'Telegram' }}<span v-if="item.username"> · @{{ item.username }}</span></p>
          <NuxtLink v-if="item.guestId && item.guestId !== guestId" :to="`/guests/${item.guestId}`" class="inline-flex min-h-11 items-center text-sm underline">{{ t('guests.linkedGuest') }}</NuxtLink>
        </div>
        <div v-else class="min-w-0">
          <p class="break-words font-medium">{{ item.apartmentName }}<span v-if="item.guestName"> · {{ item.guestName }}</span></p>
          <p class="text-sm text-[var(--color-muted)]">{{ formatDate(item.checkInOn) }} – {{ formatDate(item.checkOutOn) }}</p>
        </div>
        <UButton
          color="neutral" variant="outline" class="min-h-11 shrink-0"
          :disabled="pending || linkedIds.includes(isContact(item) ? item.contactId : item.id) || Boolean(isContact(item) && item.guestId)"
          @click="link(item)"
        >{{ linkedIds.includes(isContact(item) ? item.contactId : item.id) ? t('guests.linked') : t(!isContact(item) && item.guestId ? 'guests.relink' : 'guests.link') }}</UButton>
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
