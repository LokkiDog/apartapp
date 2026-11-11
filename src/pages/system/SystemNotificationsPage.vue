<script setup lang="ts">
import { switchClientContext, useCurrentUser } from '#fsd/shared/auth'
import { EmptyState, PageHeader } from '#fsd/shared/ui'
import type { SystemNotification, SystemNotificationFeed } from '@contracts/system-notifications'

const user = useCurrentUser()
const identity = computed(() => user.value?.isSuperuser ? user.value.id : undefined)
const { data: feed, refresh, status, error: loadError } = useAsyncData(
  'system-notifications',
  () => identity.value ? $fetch<SystemNotificationFeed>('/api/system/notifications') : Promise.resolve({ items: [], nextCursor: null }),
  { server: false, default: () => ({ items: [], nextCursor: null }), watch: [identity] }
)
const readingId = ref<string | null>(null)
const enteringId = ref<string | null>(null)
const loadingMore = ref(false)
const error = ref('')
const formatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

async function markRead(item: SystemNotification) {
  if (readingId.value || item.readAt) return
  const userId = identity.value
  readingId.value = item.id
  error.value = ''
  try {
    const { readAt } = await $fetch<{ readAt: string }>(`/api/system/notifications/${item.id}/read`, { method: 'POST' })
    if (identity.value !== userId) return
    feed.value = { ...feed.value, items: feed.value.items.map(row => row.id === item.id ? { ...row, readAt } : row) }
    await refreshNuxtData(['system-notifications-unread', 'system-messaging-setup-requests'])
  } catch {
    error.value = 'Не удалось отметить уведомление прочитанным'
  } finally {
    readingId.value = null
  }
}

async function loadMore() {
  const cursor = feed.value.nextCursor
  const userId = identity.value
  if (!cursor || loadingMore.value) return
  loadingMore.value = true
  error.value = ''
  try {
    const next = await $fetch<SystemNotificationFeed>('/api/system/notifications', { query: { cursor } })
    if (identity.value !== userId || feed.value.nextCursor !== cursor) return
    feed.value = { items: [...feed.value.items, ...next.items], nextCursor: next.nextCursor }
  } catch {
    error.value = 'Не удалось загрузить историю'
  } finally {
    loadingMore.value = false
  }
}

async function openClient(id: string) {
  if (enteringId.value) return
  enteringId.value = id
  error.value = ''
  try {
    await switchClientContext(id)
  } catch {
    error.value = 'Не удалось открыть CRM клиента'
    enteringId.value = null
  }
}
</script>

<template>
  <section class="space-y-4">
    <PageHeader title="Уведомления" />
    <UAlert v-if="loadError" color="error" role="alert" orientation="horizontal" description="Не удалось загрузить уведомления">
      <template #actions><UButton color="error" variant="ghost" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <UAlert v-if="error" color="error" role="alert" :description="error" />
    <USkeleton v-if="(status === 'pending' || status === 'idle') && !feed.items.length" class="h-20 rounded-xl" aria-label="Загрузка уведомлений" />
    <EmptyState v-else-if="status === 'success' && !feed.items.length" icon="i-lucide-bell" title="Уведомлений пока нет" />
    <ul v-if="feed.items.length" aria-label="Уведомления суперадмина" class="surface divide-y divide-[var(--color-line)]">
      <li v-for="item in feed.items" :key="item.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 sm:px-4">
        <div class="min-w-0 flex-[1_1_18rem] break-words">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span v-if="!item.readAt" class="size-2 shrink-0 rounded-full bg-[var(--color-primary)]"><span class="sr-only">Новое</span></span>
            <p class="text-sm font-semibold">{{ item.title }}</p>
            <time :datetime="item.createdAt" class="text-xs text-[var(--color-muted)]">{{ formatter.format(new Date(item.createdAt)) }}</time>
          </div>
          <p v-if="item.company" class="text-sm font-medium">{{ item.company }}</p>
          <p class="text-sm text-[var(--color-muted)]">{{ item.body }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <UButton v-if="item.organizationId" color="primary" variant="ghost" :loading="enteringId === item.organizationId" :disabled="enteringId !== null" @click="openClient(item.organizationId)">Открыть CRM</UButton>
          <UButton v-if="!item.readAt" color="neutral" variant="outline" icon="i-lucide-check" aria-label="Отметить уведомление прочитанным" :loading="readingId === item.id" :disabled="readingId !== null" @click="markRead(item)">Прочитано</UButton>
        </div>
      </li>
    </ul>
    <UButton v-if="feed.nextCursor" color="neutral" variant="soft" :loading="loadingMore" @click="loadMore">Показать ещё</UButton>
  </section>
</template>
