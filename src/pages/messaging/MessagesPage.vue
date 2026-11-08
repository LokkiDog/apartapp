<script setup lang="ts">
import type {
  GuestMessage,
  MessagingConversation,
  MessagingConnection,
} from '@contracts/messaging'
import { MAX_MESSAGE_FILE_BYTES } from '@contracts/messaging'
import type { Stay } from '#fsd/entities/stay'
import { clientResourceUrl, useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, PageHeader } from '#fsd/shared/ui'
const { t, locale } = useI18n()
const user = useCurrentUser()
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
const conversations = ref<MessagingConversation[]>([])
const conversationNext = ref<string | null>(null)
const messages = ref<GuestMessage[]>([])
const historyNext = ref<string | null>(null)
const error = ref('')
const text = ref('')
const upload = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pending = ref(false)
const polling = ref(false)
const connection = ref<MessagingConnection | null>(null)
const frozen = ref<{
  requestId: string
  text: string
  file: File | null
} | null>(null)
const list = ref<HTMLElement | null>(null)
const linkOpen = ref(false)
const stayId = ref<string | undefined>()
const linkPending = ref(false)
const detail = ref<MessagingConversation | null>(null)
const selected = computed(
  () =>
    detail.value ??
    conversations.value.find((item) => item.id === selectedId.value),
)
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
      items: MessagingConversation[]
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
    }
  },
  { immediate: true },
)
watch([identity, allowed], () => {
  linkOpen.value = false
  stayId.value = undefined
  clearNuxtData('messaging-stay-options')
  conversations.value = []
  messages.value = []
  detail.value = null
  connection.value = null
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
async function loadHistory(older = false) {
  const id = selectedId.value
  const current = identity.value
  if (!id || !validId.value || !allowed.value) return
  const previousNext = historyNext.value
  const result = await $fetch<{
    items: GuestMessage[]
    next: string | null
    conversation: MessagingConversation
  }>(`/api/messaging/conversations/${id}`, {
    query: older ? { before: previousNext } : undefined,
  })
  if (id !== selectedId.value || current !== identity.value || !allowed.value)
    return
  detail.value = result.conversation
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
  // If more than one page arrived between polls, leave a visible way to fetch the gap.
  if (!older && hadMessages && !overlapsHistory && result.next)
    historyNext.value = result.next
  const through = result.items
    .filter((item) => item.direction === 'incoming')
    .at(-1)?.id
  if (through)
    await $fetch(`/api/messaging/conversations/${id}/read`, {
      method: 'POST',
      body: { through },
    })
  if (!older && atBottom) {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  }
}
watch(
  selectedId,
  () => {
    messages.value = []
    detail.value = null
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
async function refreshInbox() {
  if (polling.value || !allowed.value || document.visibilityState !== 'visible')
    return
  polling.value = true
  const current = identity.value
  try {
    const [result, settings] = await Promise.all([
      $fetch<{ items: MessagingConversation[]; next: string | null }>(
        '/api/messaging/conversations',
      ),
      $fetch<MessagingConnection>('/api/messaging/connection'),
    ])
    if (current !== identity.value || !allowed.value) return
    connection.value = settings
    const merged = new Map(conversations.value.map((item) => [item.id, item]))
    for (const item of result.items) merged.set(item.id, item)
    conversations.value = [...merged.values()].sort(
      (a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt) ||
        b.id.localeCompare(a.id),
    )
    if (!conversationNext.value) conversationNext.value = result.next
    await loadHistory()
  } catch (cause) {
    if (current === identity.value) showError(cause)
  } finally {
    polling.value = false
  }
}
onMounted(() => {
  void refreshInbox()
})
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    void refreshInbox()
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
async function moreConversations() {
  if (!conversationNext.value || polling.value) return
  polling.value = true
  const current = identity.value
  try {
    const result = await $fetch<{
      items: MessagingConversation[]
      next: string | null
    }>('/api/messaging/conversations', {
      query: { before: conversationNext.value },
    })
    if (current !== identity.value || !allowed.value) return
    const merged = new Map(conversations.value.map((item) => [item.id, item]))
    for (const item of result.items) merged.set(item.id, item)
    conversations.value = [...merged.values()]
    conversationNext.value = result.next
  } catch (cause) {
    showError(cause)
  } finally {
    polling.value = false
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
async function sendMessage() {
  if (pending.value || !selectedId.value || !allowed.value) return
  const draft = frozen.value ?? {
    requestId: crypto.randomUUID(),
    text: text.value.trim(),
    file: upload.value,
  }
  if (
    (!draft.text && !draft.file) ||
    (draft.file && draft.text.length > 1024)
  ) {
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
    await $fetch(`/api/messaging/conversations/${id}/messages`, {
      method: 'POST',
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
    if (id === selectedId.value && current === identity.value) showError(cause)
  } finally {
    pending.value = false
  }
}
const {
  data: stays,
  refresh: loadStays,
  error: staysError,
} = await useAsyncData<Stay[]>(
  'messaging-stay-options',
  () =>
    linkOpen.value && allowed.value
      ? $fetch<Stay[]>('/api/stays')
      : Promise.resolve([]),
  { server: false, default: () => [], watch: [identity, linkOpen] },
)
const stayOptions = computed(() =>
  stays.value.map((stay) => ({
    value: stay.id,
    label: `${stay.apartment.name} · ${stay.guestName || '—'} · ${stay.checkInOn} – ${stay.checkOutOn}`,
  })),
)
function openLink() {
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
      :description="error || t('common.error')"
      ><template #actions
        ><UButton
          color="error"
          variant="soft"
          @click="retryInbox"
          >{{ t('messaging.retry') }}</UButton
        ></template
      ></UAlert
    >
    <UAlert
      v-if="connection && !connection.connected"
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
        <NuxtLink
          v-for="conversation in conversations"
          :key="conversation.id"
          :to="`/messages/${conversation.id}`"
          class="messaging-conversation"
          :aria-current="selectedId === conversation.id ? 'page' : undefined"
        >
          <div class="flex items-center justify-between gap-2">
            <strong class="truncate">{{ conversation.name }}</strong
            ><UBadge v-if="conversation.unread" color="primary">{{
              conversation.unread
            }}</UBadge>
          </div>
          <p
            v-if="conversation.apartmentName"
            class="truncate text-sm text-[var(--color-muted)]"
          >
            {{ conversation.apartmentName }} · {{ conversation.checkInOn }}
          </p>
          <p v-else class="text-sm text-[var(--color-muted)]">
            Telegram<span v-if="conversation.username">
              · @{{ conversation.username }}</span
            >
          </p>
        </NuxtLink>
        <UButton
          v-if="conversationNext"
          color="neutral"
          variant="ghost"
          class="w-full"
          :loading="polling"
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
            class="flex items-center justify-between gap-2 p-3 border-b border-[var(--color-line)]"
          >
            <div class="flex min-w-0 items-center gap-2">
              <UButton
                to="/messages"
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-left"
                class="md:hidden"
                :aria-label="t('messaging.back')"
              /><strong class="truncate">{{
                selected?.name || t('messaging.guest')
              }}</strong>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              :disabled="!selected"
              @click="openLink"
              >{{ selected?.apartmentName || t('messaging.linkStay') }}</UButton
            >
          </header>
          <p
            v-if="selected?.stayId"
            class="px-3 py-2 text-sm text-[var(--color-muted)]"
          >
            {{ selected.guestName }} · {{ selected.checkInOn }} –
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
                v-if="message.authorName"
                class="text-xs text-[var(--color-muted)]"
              >
                {{ message.authorName }}
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
            <UTextarea
              v-model="text"
              :aria-label="t('messaging.message')"
              :placeholder="t('messaging.message')"
              :rows="2"
              :maxlength="upload ? 1024 : 4096"
              :disabled="pending || Boolean(frozen)"
              class="w-full"
            />
            <div class="flex flex-wrap items-center gap-2">
              <label class="messaging-upload"
                ><UIcon name="i-lucide-paperclip" />{{ t('messaging.file')
                }}<input
                  ref="fileInput"
                  type="file"
                  :disabled="pending || Boolean(frozen)"
                  :aria-label="t('messaging.file')"
                  @change="chooseFile"
              /></label>
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
              <UButton
                type="submit"
                class="ms-auto"
                :disabled="
                  pending || !connection?.connected || (!text.trim() && !upload)
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
    <USlideover
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
              value-key="value"
              :placeholder="t('messaging.selectStay')"
              class="w-full" /></UFormField
          ><UButton
            color="neutral"
            variant="ghost"
            @click="stayId = undefined"
            >{{ t('messaging.unlinkStay') }}</UButton
          ><UAlert
            v-if="staysError || error"
            color="error"
            :description="error || t('common.error')"
            ><template #actions
              ><UButton @click="loadStays()">{{
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
      ></USlideover
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
  border-bottom: 1px solid var(--color-line);
  cursor: pointer;
  transition: background-color 120ms;
}
.messaging-conversation:hover,
.messaging-conversation[aria-current='page'],
.messaging-conversation:active {
  background-color: var(--color-surface-muted);
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
