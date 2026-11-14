<script setup lang="ts">
import { normalizeGuestPhone, type GuestConversation, type GuestDetail } from '@contracts/guests'
import { useCurrentUser, useCurrentUserScope } from '#fsd/shared/auth'
import { formatDate } from '#fsd/shared/lib'
import { PageHeader } from '#fsd/shared/ui'
import { GuestForm } from '#fsd/features/guest-form'
import GuestLinkPicker from './GuestLinkPicker.vue'

const { t } = useI18n()
const route = useRoute()
const user = useCurrentUser()
const userScope = useCurrentUserScope()
const id = computed(() => String(route.params.id))
const allowed = computed(() => user.value?.guestsEnabled && user.value.roles.includes('administrator') && !user.value.inSystem)
const messagingEnabled = computed(() => allowed.value && user.value?.messagingEnabled)
const formOpen = ref(false)
const picker = ref<'stay' | 'contact' | null>(null)
const channels = [
  { id: 'telegram', label: 'Telegram', icon: 'i-lucide-send' },
  { id: 'line', label: 'LINE', icon: 'i-lucide-message-circle' },
] as const
const selectedChannel = ref<GuestConversation['channel']>()
const messengerRows = computed(() => channels.map(channel => ({
  ...channel,
  conversations: guest.value?.conversations.filter(chat => chat.channel === channel.id) ?? [],
})))
const pickerTitle = computed(() => picker.value === 'contact'
  ? t('guests.linkChannel', { channel: channels.find(channel => channel.id === selectedChannel.value)?.label })
  : t('guests.linkStay'))

function openChannelPicker(channel: GuestConversation['channel']) {
  selectedChannel.value = channel
  picker.value = 'contact'
}
const pickerOpen = computed({ get: () => Boolean(picker.value), set: value => { if (!value) picker.value = null } })
const pending = ref(false)
const error = ref('')
const { data: guest, status, refresh } = await useAsyncData(
  computed(() => `guest-${userScope.value}-${id.value}`),
  () => allowed.value ? $fetch<GuestDetail>(`/api/guests/${encodeURIComponent(id.value)}`) : Promise.resolve(null),
  { server: false, default: () => null, watch: [userScope] },
)
const phone = computed(() => normalizeGuestPhone(guest.value?.phone ?? ''))
watch([id, userScope], () => {
  formOpen.value = false
  picker.value = null
  error.value = ''
})
watch(messagingEnabled, enabled => { if (!enabled && picker.value === 'contact') picker.value = null })

async function unlink(kind: 'stay' | 'contact', linkedId: string) {
  if (pending.value || !guest.value) return
  const guestId = guest.value.id
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/guests/${guestId}/${kind}`, { method: 'PATCH', body: { id: linkedId, linked: false } })
    if (id.value === guestId) await refresh()
  } catch {
    if (id.value === guestId) error.value = t('common.error')
  } finally {
    pending.value = false
  }
}

async function onLinked() {
  picker.value = null
  await refresh()
}
</script>

<template>
  <section v-if="allowed" class="page-wrap space-y-4">
    <UButton to="/guests" color="neutral" variant="ghost" icon="i-lucide-arrow-left" class="min-h-11">{{ t('guests.title') }}</UButton>
    <p v-if="status === 'pending' || status === 'idle'" role="status">{{ t('guests.loading') }}</p>
    <UAlert v-else-if="status === 'error' || !guest" color="error" variant="soft" :description="t('guests.loadError')" :actions="[{ label: t('guests.retry'), onClick: () => refresh() }]" />
    <template v-else>
      <PageHeader :title="guest.name || t('guests.unnamed')">
        <template #actions><UButton icon="i-lucide-pencil" color="neutral" variant="outline" class="min-h-11" @click="formOpen = true">{{ t('guests.edit') }}</UButton></template>
      </PageHeader>

      <section class="surface p-4">
        <h2 class="font-semibold">{{ t('guests.contacts') }}</h2>
        <div v-if="guest.phone || guest.email || guest.whatsapp" class="mt-2 flex flex-wrap gap-2">
          <UButton v-if="phone" :to="`tel:${phone}`" external icon="i-lucide-phone" color="neutral" variant="outline" class="min-h-11"><bdi>{{ guest.phone }}</bdi></UButton>
          <span v-else-if="guest.phone" class="inline-flex min-h-11 items-center gap-2 px-2"><UIcon name="i-lucide-phone" /><bdi>{{ guest.phone }}</bdi></span>
          <UButton v-if="guest.email" :to="`mailto:${encodeURIComponent(guest.email)}`" external icon="i-lucide-mail" color="neutral" variant="outline" class="min-h-11 max-w-full"><bdi class="truncate">{{ guest.email }}</bdi></UButton>
          <UButton v-if="guest.whatsapp" :to="`https://wa.me/${guest.whatsapp.slice(1)}`" external target="_blank" rel="noopener noreferrer" icon="i-lucide-message-circle" color="neutral" variant="outline" class="min-h-11">WhatsApp <bdi>{{ guest.whatsapp }}</bdi></UButton>
        </div>
        <p v-else-if="!messagingEnabled" class="mt-2 text-sm text-[var(--color-muted)]">{{ t('guests.noContacts') }}</p>
        <div v-if="messagingEnabled" class="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          <div v-for="channel in messengerRows" :key="channel.id" class="py-1">
            <div class="flex min-h-11 items-center justify-between gap-2">
              <h3 class="flex items-center gap-2 font-medium">
                <UIcon :name="channel.icon" class="size-4 text-[var(--color-muted)]" />
                {{ channel.label }}
              </h3>
              <UButton icon="i-lucide-link" color="neutral" variant="ghost" class="min-h-11" :aria-label="t('guests.linkChannel', { channel: channel.label })" @click="openChannelPicker(channel.id)">{{ t('guests.link') }}</UButton>
            </div>
            <ul v-if="channel.conversations.length" class="divide-y divide-[var(--color-line)]">
              <li v-for="conversation in channel.conversations" :key="conversation.id" class="flex items-center gap-2">
                <NuxtLink :to="`/messages/${conversation.id}`" class="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-primary-soft)]">
                  <span class="truncate">{{ conversation.name }}<template v-if="conversation.username"> · @{{ conversation.username }}</template></span>
                  <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 rtl:rotate-180" />
                </NuxtLink>
                <UButton icon="i-lucide-unlink" color="neutral" variant="ghost" class="size-11 shrink-0 justify-center" :aria-label="t('guests.unlinkContact', { name: conversation.name })" :disabled="pending" @click="unlink('contact', conversation.contactId)" />
              </li>
            </ul>
          </div>
        </div>
        <div v-if="guest.notes" class="mt-3 border-t border-[var(--color-line)] pt-3">
          <h3 class="text-sm font-semibold">{{ t('guests.notes') }}</h3>
          <p class="mt-1 whitespace-pre-wrap break-words text-sm">{{ guest.notes }}</p>
        </div>
      </section>

      <UAlert v-if="error" color="error" variant="soft" :description="error" />
      <section class="surface overflow-hidden">
        <div class="flex items-center justify-between gap-2 px-4 py-2">
          <h2 class="font-semibold">{{ t('guests.stays') }}</h2>
          <UButton icon="i-lucide-link" color="neutral" variant="ghost" class="min-h-11" @click="picker = 'stay'">{{ t('guests.linkStay') }}</UButton>
        </div>
        <ul v-if="guest.stays.length" class="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          <li v-for="stay in guest.stays" :key="stay.id" class="flex items-center justify-between gap-2 px-2">
            <NuxtLink :to="{ path: '/calendar', query: { stay: stay.id } }" class="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-2 hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-primary-soft)]">
              <span class="truncate font-medium">{{ stay.apartmentName }}</span>
              <span class="text-sm text-[var(--color-muted)]">{{ formatDate(stay.checkInOn) }} – {{ formatDate(stay.checkOutOn) }}</span>
            </NuxtLink>
            <UButton icon="i-lucide-unlink" color="neutral" variant="ghost" class="size-11 justify-center" :aria-label="t('guests.unlinkStay', { name: stay.apartmentName })" :disabled="pending" @click="unlink('stay', stay.id)" />
          </li>
        </ul>
        <p v-else class="px-4 pb-3 text-sm text-[var(--color-muted)]">{{ t('guests.noStays') }}</p>
      </section>

      <GuestForm v-model:open="formOpen" :guest="guest" @saved="refresh()" />
      <USlideover :modal="true" :overlay="true" v-model:open="pickerOpen" :title="pickerTitle">
        <template #body>
          <GuestLinkPicker
            v-if="picker" :key="`${picker}:${selectedChannel}`" :guest-id="guest.id" :kind="picker"
            :channel="picker === 'contact' ? selectedChannel : undefined"
            :linked-ids="picker === 'stay' ? guest.stays.map(stay => stay.id) : guest.conversations.map(item => item.contactId)"
            @saved="onLinked"
          />
        </template>
      </USlideover>
    </template>
  </section>
</template>
