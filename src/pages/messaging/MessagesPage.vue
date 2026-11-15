<script setup lang="ts">
import type {
  GuestMessage,
  MessagingConversation,
  MessagingConnection,
  MessagingInboxItem,
  MessagingSource,
  MessagingChannel,
} from '@contracts/messaging'
import { MAX_MESSAGE_FILE_BYTES } from '@contracts/messaging'
import { useNotificationState } from '#fsd/features/manage-notifications'
import { GuestForm } from '#fsd/features/guest-form'
import ConversationContactField from './ConversationContactField.vue'
import ConversationGuestPicker from './ConversationGuestPicker.vue'
import ReplyTemplatePicker from './ReplyTemplatePicker.vue'
import type { Stay } from '#fsd/entities/stay'
import { clientResourceUrl, useCurrentUser } from '#fsd/shared/auth'
import { formatDate } from '#fsd/shared/lib'
import { EmptyState, PageHeader, ResponsiveFormDialog } from '#fsd/shared/ui'
const { t, locale } = useI18n()
const user = useCurrentUser()
const { messagingRevision } = useNotificationState()
const route = useRoute()
const selectedId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : '',
)
const identity = computed(
  () =>
    `${user.value?.organizationId}:${user.value?.id}:${user.value?.contextRevision}`,
)
const allowed = computed(() =>
  Boolean(
    user.value?.messagingEnabled && user.value.roles.includes('administrator'),
  ),
)
const conversations = ref<MessagingInboxItem[]>([])
const inboxPages = ref(1)
const conversationNext = ref<string | null>(null)
const messages = ref<GuestMessage[]>([])
const historyNext = ref<string | null>(null)
const error = ref('')
const text = ref('')
const upload = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pending = ref(false)
const refreshing = ref(false)
let refreshQueued = false
const connection = ref<MessagingConnection | null>(null)
const sources = ref<MessagingSource[]>([])
const defaultReplyId = ref('')
const chosenReplyId = ref<string>()
const replySource = computed(() => sources.value.find(
  source => source.id === (frozen.value?.conversationId ?? chosenReplyId.value ?? defaultReplyId.value),
))
const frozen = ref<{
  conversationId: string
  requestId: string
  text: string
  file: File | null
} | null>(null)
const list = ref<HTMLElement | null>(null)
const linkOpen = ref(false)
const guestPickerOpen = ref(false)
const guestFormOpen = ref(false)
const stayId = ref<string | undefined>()
const stayPickerToday = ref('')
const showEarlierStays = ref(false)
const linkPending = ref(false)
const detail = ref<MessagingConversation | null>(null)
const selected = computed(
  () =>
    detail.value ??
    conversations.value.find((item) => item.id === selectedId.value),
)
const templateValues = computed(() => {
  const chat = selected.value
  const booking = chat?.stayId ? chat : undefined
  return {
    guestName: chat?.guestDisplayName?.trim() || chat?.name.trim() || undefined,
    apartmentName: booking?.apartmentName?.trim() || undefined,
    checkInOn: booking?.checkInOn ? formatDate(booking.checkInOn) : undefined,
    checkOutOn: booking?.checkOutOn ? formatDate(booking.checkOutOn) : undefined,
  }
})
function channelName(channel: MessagingChannel) {
  return channel === 'line' ? 'LINE' : 'Telegram'
}
function sourceLabel(source: MessagingSource) {
  return [channelName(source.channel), source.username ? `@${source.username}` : source.name].join(' · ')
}
const displayedChannels = computed(() => [...new Set(sources.value.map(source => channelName(source.channel)))].join(' · '))
const sourcesById = computed(() => new Map(sources.value.map(source => [source.id, source])))
const repeatedChannels = computed(() => {
  const seen = new Set<MessagingChannel>()
  const repeated = new Set<MessagingChannel>()
  for (const source of sources.value) {
    if (seen.has(source.channel)) repeated.add(source.channel)
    seen.add(source.channel)
  }
  return repeated
})
const replyOptions = computed(() => sources.value.map(source => ({
  value: source.id,
  label: sourceLabel(source),
})))
const replySelection = computed({
  get: () => replySource.value?.id,
  set: (id) => { chosenReplyId.value = id },
})
function isSelected(item: MessagingConversation) {
  return selectedId.value === item.id || Boolean(item.guestId && item.guestId === selected.value?.guestId)
}
const validId = computed(
  () => !selectedId.value || /^[0-9a-f-]{36}$/i.test(selectedId.value),
)
const {
  data: initial,
  status,
  error: inboxError,
  clear,
} = await useAsyncData(
  'messaging-inbox',
  async () => {
    if (!allowed.value) return null
    const current = identity.value
    const result = await $fetch<{
      items: MessagingInboxItem[]
      next: string | null
    }>('/api/messaging/conversations')
    return current === identity.value && allowed.value ? result : null
  },
  { server: false, default: () => null, watch: [identity, allowed] },
)
watch(
  initial,
  (value) => {
    if (value && allowed.value) {
      conversations.value = value.items
      conversationNext.value = value.next
      inboxPages.value = 1
    }
  },
  { immediate: true },
)
watch([identity, allowed], () => {
  linkOpen.value = false
  stayId.value = undefined
  clearNuxtData('messaging-stay-options')
  conversations.value = []
  conversationNext.value = null
  inboxPages.value = 1
  messages.value = []
  detail.value = null
  connection.value = null
  sources.value = []
  chosenReplyId.value = undefined
  defaultReplyId.value = ''
  text.value = ''
  upload.value = null
  frozen.value = null
  error.value = ''
  initial.value = null
  if (!allowed.value) clear()
  if (!allowed.value) void navigateTo('/')
})
function showError(cause: any) {
  if (cause?.data?.data?.code === 'MESSAGING_DISABLED') {
    const { session } = useUserSession()
    if (user.value && session.value)
      session.value = {
        ...session.value,
        user: { ...user.value, messagingEnabled: false },
      }
    return
  }
  error.value = cause?.data?.statusMessage ?? t('common.error')
}
let historyRequest = 0
async function loadHistory(older = false): Promise<void> {
  const id = selectedId.value
  const current = identity.value
  if (!id || !validId.value || !allowed.value) return
  const previousNext = historyNext.value
  if (older && !previousNext) return
  const request = ++historyRequest
  const result = await $fetch<{
    items: GuestMessage[]
    next: string | null
    conversation: MessagingConversation
    sources: MessagingSource[]
    replyTo: string
  }>(`/api/messaging/conversations/${id}`, {
    query: older ? { before: previousNext } : undefined,
  })
  if (request !== historyRequest || id !== selectedId.value || current !== identity.value || !allowed.value)
    return
  const scopeChanged = sources.value.length !== result.sources.length
    || sources.value.some(source => !result.sources.some(item => item.id === source.id))
  detail.value = result.conversation
  if (scopeChanged) {
    messages.value = []
    historyNext.value = null
    if (older) return loadHistory()
  }
  sources.value = result.sources
  defaultReplyId.value = result.replyTo
  if (!sources.value.some(source => source.id === chosenReplyId.value))
    chosenReplyId.value = undefined
  if (frozen.value && !sources.value.some(source => source.id === frozen.value?.conversationId))
    frozen.value = null
  const atBottom =
    !list.value ||
    list.value.scrollHeight - list.value.scrollTop - list.value.clientHeight <
      100
  const hadMessages = messages.value.length > 0
  const overlapsHistory = result.items.some((item) =>
    messages.value.some((existing) => existing.id === item.id),
  )
  const merged = new Map(messages.value.map((item) => [item.id, item]))
  for (const item of result.items) merged.set(item.id, item)
  messages.value = [...merged.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  if (older || !hadMessages) historyNext.value = result.next
  // If more than one page arrived between refreshes, leave a visible way to fetch the gap.
  if (!older && hadMessages && !overlapsHistory && result.next)
    historyNext.value = result.next
  const readThrough = new Map<string, string>()
  for (const item of result.items) {
    if (item.direction === 'incoming') readThrough.set(item.conversationId, item.id)
  }
  await Promise.all([...readThrough].map(([chatId, through]) =>
    $fetch(`/api/messaging/conversations/${chatId}/read`, {
      method: 'POST',
      body: { through },
    }),
  ))
  if (!older && atBottom) {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  }
}
watch(
  [selectedId, identity, allowed],
  () => {
    messages.value = []
    detail.value = null
    sources.value = []
    chosenReplyId.value = undefined
    defaultReplyId.value = ''
    historyNext.value = null
    text.value = ''
    upload.value = null
    frozen.value = null
    error.value = ''
    if (fileInput.value) fileInput.value.value = ''
    void loadHistory().catch(showError)
  },
  { immediate: true },
)
type InboxPage = { items: MessagingInboxItem[]; next: string | null }
function fetchInboxPage(before?: string) {
  return $fetch<InboxPage>('/api/messaging/conversations', { query: { before } })
}
async function refreshInbox() {
  if (!allowed.value) return
  if (refreshing.value) {
    refreshQueued = true
    return
  }
  refreshing.value = true
  const current = identity.value
  try {
    const [first, settings] = await Promise.all([
      fetchInboxPage(),
      $fetch<MessagingConnection>('/api/messaging/connection'),
    ])
    const items = new Map(first.items.map(item => [item.guestId ?? item.id, item]))
    let next = first.next
    for (let page = 1; page < inboxPages.value && next && current === identity.value; page++) {
      const result = await fetchInboxPage(next)
      for (const item of result.items) items.set(item.guestId ?? item.id, item)
      next = result.next
    }
    if (current !== identity.value || !allowed.value) return
    connection.value = settings
    conversations.value = [...items.values()]
    conversationNext.value = next
    await loadHistory()
  } catch (cause) {
    if (current === identity.value) showError(cause)
  } finally {
    refreshing.value = false
    if (refreshQueued) {
      refreshQueued = false
      void refreshInbox()
    }
  }
}
watch(messagingRevision, () => { void refreshInbox() })
onMounted(() => { void refreshInbox() })
async function moreConversations() {
  if (!conversationNext.value || refreshing.value) return
  refreshing.value = true
  const current = identity.value
  try {
    const result = await fetchInboxPage(conversationNext.value)
    if (current !== identity.value || !allowed.value) return
    const merged = new Map(conversations.value.map(item => [item.guestId ?? item.id, item]))
    for (const item of result.items) merged.set(item.guestId ?? item.id, item)
    conversations.value = [...merged.values()]
    conversationNext.value = result.next
    inboxPages.value++
  } catch (cause) {
    showError(cause)
  } finally {
    refreshing.value = false
    if (refreshQueued) {
      refreshQueued = false
      void refreshInbox()
    }
  }
}
function retryInbox() {
  error.value = ''
  void refreshInbox()
}
function removeFile() {
  upload.value = null
  if (fileInput.value) fileInput.value.value = ''
}
function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > MAX_MESSAGE_FILE_BYTES) {
    error.value = t('messaging.fileLimit')
    upload.value = null
    ;(event.target as HTMLInputElement).value = ''
    return
  }
  upload.value = file
}
function onMessageEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (!event.repeat) void sendMessage()
}
async function sendMessage() {
  const source = replySource.value
  if (pending.value || !selectedId.value || !allowed.value || !source?.connected) return
  if (upload.value && source.channel !== 'telegram') return
  if (!text.value.trim() && !upload.value) return
  const draft = frozen.value ?? {
    conversationId: source.id,
    requestId: crypto.randomUUID(),
    text: text.value.trim(),
    file: upload.value,
  }
  if (draft.file && draft.text.length > 1024) {
    error.value = t('messaging.captionLimit')
    return
  }
  frozen.value = draft
  pending.value = true
  error.value = ''
  const id = selectedId.value
  const current = identity.value
  try {
    const body = new FormData()
    body.set('requestId', draft.requestId)
    body.set('text', draft.text)
    if (draft.file) body.set('file', draft.file)
    await $fetch(`/api/messaging/conversations/${draft.conversationId}/messages`, {
      method: 'POST',
      query: { thread: id },
      body,
      retry: false,
    })
    if (id !== selectedId.value || current !== identity.value || !allowed.value)
      return
    text.value = ''
    upload.value = null
    frozen.value = null
    if (fileInput.value) fileInput.value.value = ''
    await loadHistory()
  } catch (cause) {
    if (id === selectedId.value && current === identity.value) {
      showError(cause)
      if ((cause as { data?: { data?: { code?: string } } }).data?.data?.code === 'MESSAGING_THREAD_CHANGED') {
        frozen.value = null
        await loadHistory().catch(showError)
      }
    }
  } finally {
    pending.value = false
  }
}
const {
  data: stays,
  status: staysStatus,
  refresh: loadStays,
  error: staysError,
} = useAsyncData<Stay[]>(
  'messaging-stay-options',
  (_nuxtApp, { signal }) =>
    linkOpen.value && allowed.value
      ? $fetch<Stay[]>('/api/stays', { signal })
      : Promise.resolve([]),
  {
    server: false,
    immediate: false,
    default: () => [],
    getCachedData: () => undefined,
    watch: [identity, allowed, linkOpen],
  },
)
const staysLoading = computed(() => staysStatus.value === 'idle' || staysStatus.value === 'pending')
function stayLabel(stay: Stay) {
  return `${stay.apartment.name} · ${stay.guestName || '—'} · ${stay.checkInOn} – ${stay.checkOutOn}`
}

const currentStays = computed(() => stays.value.filter(stay => stay.checkOutOn >= stayPickerToday.value))
const earlierStays = computed(() => stays.value
  .filter(stay => stay.checkOutOn < stayPickerToday.value)
  .sort((left, right) => right.checkOutOn.localeCompare(left.checkOutOn)))
const stayOptions = computed(() => {
  const visibleStays = showEarlierStays.value ? [...currentStays.value, ...earlierStays.value] : currentStays.value
  return visibleStays.map(stay => ({ value: stay.id, label: stayLabel(stay) }))
})
const selectedStayLabel = computed(() => {
  const stay = stays.value.find(stay => stay.id === stayId.value)
  return stay ? stayLabel(stay) : undefined
})

function openLink() {
  stayPickerToday.value = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Sofia',
  }).format(new Date())
  showEarlierStays.value = false
  stayId.value = selected.value?.stayId ?? undefined
  linkOpen.value = true
}
async function saveLink() {
  if (!selectedId.value || linkPending.value) return
  linkPending.value = true
  error.value = ''
  const id = selectedId.value
  const current = identity.value
  try {
    await $fetch(`/api/messaging/conversations/${id}/link`, {
      method: 'PATCH',
      body: { stayId: stayId.value ?? null },
    })
    if (
      id === selectedId.value &&
      current === identity.value &&
      allowed.value
    ) {
      linkOpen.value = false
      await refreshInbox()
    }
  } catch (cause) {
    showError(cause)
  } finally {
    linkPending.value = false
  }
}
watch([identity, allowed, selectedId], () => {
  guestPickerOpen.value = false
  guestFormOpen.value = false
}, { flush: 'sync' })

async function onGuestSaved() {
  if (!allowed.value || !selectedId.value) return
  try {
    if (refreshing.value) await loadHistory()
    else await refreshInbox()
  } catch (cause) {
    showError(cause)
  }
}
function formattedTime(value: string) {
  return new Date(value).toLocaleString(locale.value, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
</script>
<template>
  <section v-if="allowed" class="page-wrap space-y-3">
    <PageHeader :title="t('messaging.title')"
      ><template #actions
        ><UButton
          to="/settings/messaging"
          color="neutral"
          variant="outline"
          icon="i-lucide-settings"
          :aria-label="t('messaging.settings')" /></template
    ></PageHeader>
    <UAlert
      v-if="error || inboxError"
      color="error"
      orientation="horizontal"
      :description="error || t('common.error')"
      ><template #actions
        ><UButton color="error" variant="ghost"
          @click="retryInbox"
          >{{ t('messaging.retry') }}</UButton
        ></template
      ></UAlert
    >
    <UAlert
      v-if="connection && !connection.connected && !conversations.length"
      :description="t('messaging.connectHelp')"
      color="info"
      ><template #actions
        ><UButton to="/settings/messaging">{{
          t('messaging.connect')
        }}</UButton></template
      ></UAlert
    >
    <div class="surface messaging-layout">
      <aside
        class="messaging-conversations"
        :class="{ 'messaging-mobile-hidden': selectedId }"
      >
        <p v-if="status === 'pending' && !conversations.length" class="p-4">
          {{ t('messaging.loading') }}
        </p>
        <EmptyState
          v-else-if="!conversations.length"
          icon="i-lucide-messages-square"
          :title="t('messaging.noConversations')"
          :description="t('messaging.startHelp')"
        />
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="messaging-conversation-row flex items-center border-b border-[var(--color-line)]"
          :class="{ 'messaging-conversation-row--selected': isSelected(conversation) }"
        >
          <NuxtLink
            :to="`/messages/${conversation.id}`"
            class="messaging-conversation min-w-0 flex-1"
            :aria-current="isSelected(conversation) ? 'page' : undefined"
          >
            <div class="flex items-center justify-between gap-2">
              <strong class="truncate">{{ conversation.guestDisplayName || conversation.name }}</strong>
              <UBadge v-if="conversation.unread" color="primary">{{ conversation.unread }}</UBadge>
            </div>
            <p v-if="conversation.apartmentName" class="truncate text-sm text-[var(--color-muted)]">
              {{ conversation.apartmentName }} · {{ conversation.checkInOn }}
            </p>
            <p v-else class="truncate text-sm text-[var(--color-muted)]">
              {{ conversation.channels.map(channelName).join(' · ') }}<span v-if="!conversation.guestId && conversation.username"> · @{{ conversation.username }}</span>
            </p>
          </NuxtLink>
          <UButton
            v-if="user?.guestsEnabled && conversation.guestId"
            :to="`/guests/${conversation.guestId}`"
            icon="i-lucide-contact"
            color="neutral"
            variant="ghost"
            class="me-1 size-11 shrink-0 justify-center"
            :aria-label="t('guests.linkedGuest') + ' · ' + (conversation.guestDisplayName || conversation.name)"
            :title="t('guests.linkedGuest')"
          />
        </div>
        <UButton
          v-if="conversationNext"
          color="neutral"
          variant="ghost"
          class="w-full"
          :loading="refreshing"
          @click="moreConversations"
          >{{ t('messaging.more') }}</UButton
        >
      </aside>
      <div
        class="messaging-chat"
        :class="{ 'messaging-mobile-hidden': !selectedId }"
      >
        <template v-if="selectedId && validId">
          <header
            class="flex items-center justify-between gap-2 px-3 py-1 border-b border-[var(--color-line)]"
          >
            <div class="flex min-w-0 items-center gap-2">
              <UButton
                to="/messages"
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-left"
                class="size-11 shrink-0 justify-center md:hidden"
                :aria-label="t('messaging.back')"
              />
              <div class="relative flex min-h-11 min-w-0 flex-col justify-center">
                <NuxtLink
                  v-if="user?.guestsEnabled && selected?.guestId"
                  :to="`/guests/${selected.guestId}`"
                  class="truncate rounded-sm font-semibold leading-5 underline after:absolute after:inset-0 hover:text-[var(--color-primary-strong)] active:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {{ selected.guestDisplayName || selected.name }}
                </NuxtLink>
                <strong v-else class="truncate leading-5">{{ selected?.name || t('messaging.guest') }}</strong>
                <span v-if="sources.length" class="truncate text-xs leading-4 text-[var(--color-muted)]">
                  {{ displayedChannels }}
                </span>
              </div>
            </div>
            <UDropdownMenu
              v-if="selected"
              :items="[
                { label: t('messaging.linkStay'), icon: 'i-lucide-calendar-days', onSelect: openLink },
                ...(user?.guestsEnabled && !selected.guestId ? [
                  { label: t('guests.linkGuest'), icon: 'i-lucide-link', onSelect: () => { guestPickerOpen = true } },
                  { label: t('guests.add'), icon: 'i-lucide-user-plus', onSelect: () => { guestFormOpen = true } },
                ] : []),
              ]"
              :ui="{ item: 'min-h-11 items-center' }"
            >
              <UButton class="size-11 shrink-0 justify-center" color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="t('messaging.chatActions')" />
            </UDropdownMenu>
          </header>
          <p
            v-if="selected?.stayId"
            class="px-3 py-2 text-sm text-[var(--color-muted)]"
          >
            {{ [selected.apartmentName, selected.guestName].filter(Boolean).join(' · ') }} · {{ selected.checkInOn }} –
            {{ selected.checkOutOn }}
          </p>
          <div
            ref="list"
            class="messaging-history"
            aria-live="polite"
            :aria-label="t('messaging.history')"
          >
            <UButton
              v-if="historyNext"
              color="neutral"
              variant="ghost"
              class="w-full"
              @click="loadHistory(true).catch(showError)"
              >{{ t('messaging.older') }}</UButton
            >
            <article
              v-for="message in messages"
              :key="message.id"
              class="messaging-message"
              :class="{
                'messaging-message-outgoing': message.direction === 'outgoing',
              }"
            >
              <p
                class="text-xs text-[var(--color-muted)]"
              >
                {{ channelName(message.channel) }}<template v-if="repeatedChannels.has(message.channel)">
                  · {{ sourcesById.get(message.conversationId)?.username || sourcesById.get(message.conversationId)?.name }}
                </template><template v-if="message.authorName"> · {{ message.authorName }}</template>
              </p>
              <p class="whitespace-pre-wrap break-words">
                {{
                  message.unsupported
                    ? t('messaging.unsupported')
                    : message.text
                }}
              </p>
              <div
                v-for="attachment in message.attachments"
                :key="attachment.id"
                class="mt-1"
              >
                <a
                  v-if="attachment.available"
                  :href="
                    clientResourceUrl(
                      `/api/messaging/attachments/${attachment.id}`,
                    )
                  "
                  class="messaging-file"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ attachment.name }} ·
                  {{ Math.ceil(attachment.size / 1024) }} KB</a
                >
                <span v-else
                  >{{ attachment.name }} ·
                  {{ t('messaging.fileUnavailable') }}</span
                >
              </div>
              <footer
                class="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--color-muted)]"
              >
                <time :datetime="message.createdAt">{{
                  formattedTime(message.createdAt)
                }}</time
                ><span
                  v-if="message.direction === 'outgoing'"
                  :class="{
                    'text-error': ['failed', 'unknown'].includes(
                      message.status,
                    ),
                  }"
                  >{{ t(`messaging.status.${message.status}`) }}</span
                >
              </footer>
            </article>
          </div>
          <form
            class="space-y-2 p-3 border-t border-[var(--color-line)]"
            @submit.prevent="sendMessage"
          >
            <UFormField v-if="replySource" :label="t('messaging.replyTo')">
              <USelect
                v-if="replyOptions.length > 1"
                v-model="replySelection"
                :items="replyOptions"
                :disabled="pending || Boolean(frozen)"
                class="min-h-11 w-full"
              />
              <p v-else class="text-sm">{{ sourceLabel(replySource) }}</p>
              <p v-if="!replySource.connected" class="mt-1 text-sm text-[var(--color-muted)]">{{ t('messaging.replyDisconnected') }}</p>
            </UFormField>
            <UTextarea
              v-model="text"
              :aria-label="t('messaging.message')"
              :placeholder="t('messaging.message')"
              :rows="2"
              :maxlength="upload ? 1024 : 4096"
              :disabled="pending || Boolean(frozen)"
              @keydown.enter="onMessageEnter"
              class="w-full"
            />
            <div class="flex flex-wrap items-center gap-2">
              <label v-if="replySource?.channel === 'telegram'" class="messaging-upload"
                ><UIcon name="i-lucide-paperclip" />{{ t('messaging.file')
                }}<input
                  ref="fileInput"
                  type="file"
                  :disabled="pending || Boolean(frozen)"
                  :aria-label="t('messaging.file')"
                  @change="chooseFile"
              /></label>
              <span v-if="upload && replySource?.channel === 'line'" class="text-sm text-[var(--color-muted)]">{{ t('messaging.lineTextOnly') }}</span>
              <span v-if="upload" class="min-w-0 flex-1 truncate text-sm">{{
                upload.name
              }}</span>
              <UButton
                v-if="upload && !frozen"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="t('messaging.removeFile')"
                @click="removeFile"
              />
              <ReplyTemplatePicker
                :key="`${identity}:${selectedId}`"
                :draft="text"
                :values="templateValues"
                :has-booking="Boolean(selected?.stayId)"
                :limit="upload ? 1024 : 4096"
                :disabled="pending || Boolean(frozen)"
                @insert="text = $event"
              />
              <UButton
                type="submit"
                class="ms-auto"
                :disabled="
                  pending || !replySource?.connected || (!text.trim() && !upload) || (Boolean(upload) && replySource.channel !== 'telegram')
                "
                :loading="pending"
                >{{ t(frozen ? 'messaging.retry' : 'messaging.send') }}</UButton
              >
            </div>
          </form>
        </template>
        <EmptyState
          v-else
          icon="i-lucide-message-circle"
          :title="t('messaging.selectConversation')"
        />
      </div>
    </div>
    <template v-if="selected && allowed && user?.guestsEnabled" :key="`${identity}:${selected.id}`">
      <ConversationGuestPicker v-model:open="guestPickerOpen" :conversation-id="selected.id" :scope="identity" @saved="onGuestSaved">
        <ConversationContactField :contact="selected" />
      </ConversationGuestPicker>
      <GuestForm v-model:open="guestFormOpen" :conversation-id="selected.id" :initial-name="selected.name" @saved="onGuestSaved">
        <ConversationContactField :contact="selected" />
      </GuestForm>
    </template>
    <ResponsiveFormDialog
      :modal="true"
      :overlay="true"
      v-model:open="linkOpen"
      :title="t('messaging.linkStay')"
      ><template #body
        ><form
          id="messaging-stay-link"
          class="space-y-4"
          @submit.prevent="saveLink"
        >
          <UFormField :label="t('messaging.stay')"
            ><USelectMenu
              v-model="stayId"
              :items="stayOptions"
              :loading="staysLoading"
              :disabled="staysLoading || !!staysError"
              value-key="value"
              :placeholder="t('messaging.selectStay')"
              :ui="{ base: 'justify-start! text-start', item: 'items-center' }"
              class="w-full"
            >
              <template #default="{ ui }">
                <span v-if="selectedStayLabel" :class="ui.value()">{{ selectedStayLabel }}</span>
                <span v-else :class="ui.placeholder()">{{ t('messaging.selectStay') }}</span>
              </template>
              <template #content-bottom>
                <div v-if="!showEarlierStays && earlierStays.length" class="shrink-0 border-t border-[var(--color-line)]">
                  <UButton
                    type="button"
                    color="neutral"
                    variant="ghost"
                    class="w-full justify-center"
                    @click="showEarlierStays = true"
                  >{{ t('messaging.showEarlierStays') }}</UButton>
                </div>
              </template>
            </USelectMenu></UFormField
          ><UButton
            color="neutral"
            variant="ghost"
            @click="stayId = undefined"
            >{{ t('messaging.unlinkStay') }}</UButton
          ><UAlert
            v-if="staysError || error"
            color="error"
            orientation="horizontal"
            :description="error || t('common.error')"
            ><template #actions
              ><UButton color="error" variant="ghost" @click="loadStays()">{{
                t('messaging.retry')
              }}</UButton></template
            ></UAlert
          >
        </form></template
      ><template #footer
        ><div class="form-actions form-actions--footer">
          <UButton color="neutral" variant="ghost" @click="linkOpen = false">{{
            t('common.cancel')
          }}</UButton
          ><UButton
            type="submit"
            form="messaging-stay-link"
            :loading="linkPending"
            >{{ t('common.save') }}</UButton
          >
        </div></template
      ></ResponsiveFormDialog
    >
  </section>
</template>
<style scoped>
.messaging-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
}
.messaging-conversations {
  border-inline-end: 1px solid var(--color-line);
  overflow-y: auto;
  max-height: 75dvh;
}
.messaging-conversation {
  display: block;
  padding: 12px 16px;
  min-height: 64px;
  cursor: pointer;
}
.messaging-conversation-row {
  transition: background-color 120ms;
}
.messaging-conversation-row:not(.messaging-conversation-row--selected):is(:hover, :active) {
  background-color: var(--color-surface-muted);
}
.messaging-conversation-row--selected {
  background-color: var(--tone-success-bg);
}
.messaging-conversation:focus-visible,
.messaging-file:focus-visible,
.messaging-upload:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.messaging-chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: min(75dvh, 850px);
  min-height: 400px;
}
.messaging-history {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.messaging-message {
  align-self: flex-start;
  max-width: 90%;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-surface-muted);
}
.messaging-message-outgoing {
  align-self: flex-end;
  background: var(--color-primary-soft);
}
.messaging-file {
  text-decoration: underline;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.messaging-file:hover,
.messaging-file:active {
  color: var(--color-primary-strong);
}
.messaging-upload {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
}
.messaging-upload:hover,
.messaging-upload:active {
  background: var(--color-surface-muted);
}
.messaging-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  cursor: pointer;
}
.messaging-upload:has(input:disabled) {
  opacity: 0.5;
  cursor: default;
}
@media (max-width: 767px) {
  .messaging-layout {
    display: block;
  }
  .messaging-conversations {
    border: 0;
  }
  .messaging-chat {
    height: 72dvh;
  }
  .messaging-mobile-hidden {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .messaging-conversation {
    transition: none;
  }
}
</style>
