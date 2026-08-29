<script setup lang="ts">
import { EmptyState, PageHeader } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { useNotificationState, type NotificationItem, type NotificationType } from '#fsd/features/manage-notifications'
import { usePushSubscription } from '#fsd/features/manage-push-subscription'
import { useI18n } from 'vue-i18n'

type Notification = NotificationItem
type Filter = 'all' | 'unread'

const currentUser = useCurrentUser()
const { t, locale } = useI18n()
const notificationState = useNotificationState()
const push = usePushSubscription()
const filter = ref<Filter>('unread')
const actionError = ref('')
const itemPendingId = ref<string | null>(null)
const markAllPending = ref(false)
const { data: items, refresh, status, error: loadError } = await useAsyncData(
  'notifications',
  () => currentUser.value ? $fetch<Notification[]>('/api/notifications') : Promise.resolve([]),
  { server: false, default: () => [], watch: [currentUser] }
)

const localeCode = computed(() => locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU')
const unreadCount = computed(() => items.value.filter(item => !item.readAt).length)
const filteredItems = computed(() => filter.value === 'unread' ? items.value.filter(item => !item.readAt) : items.value)
const visibleError = computed(() => {
  const cause = loadError.value as any
  return actionError.value || cause?.data?.statusMessage || cause?.message || ''
})
const pushDescription = computed(() => t(`notifications.push${push.description.value[0]!.toUpperCase()}${push.description.value.slice(1)}`))

const notificationAppearance: Record<NotificationType, { icon: string; className: string }> = {
  stay_changed: { icon: 'i-lucide-calendar-range', className: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]' },
  work_assigned: { icon: 'i-lucide-clipboard-check', className: 'bg-[#edf3f7] text-[#356882]' },
  work_rescheduled: { icon: 'i-lucide-calendar-clock', className: 'bg-[#fff4d7] text-[#9a5b10]' },
  work_canceled: { icon: 'i-lucide-circle-x', className: 'bg-[#f1f3f2] text-[#647a70]' },
  problem: { icon: 'i-lucide-circle-alert', className: 'bg-[#ffebec] text-[#b63843]' },
  manager_expense_report_published: { icon: 'i-lucide-receipt-euro', className: 'bg-[#e8f1f7] text-[#356882]' }
}

function dateKey(value: string) {
  const date = new Date(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function groupLabel(key: string) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (key === dateKey(today.toISOString())) return t('common.today')
  if (key === dateKey(yesterday.toISOString())) return t('notifications.yesterday')
  return new Intl.DateTimeFormat(localeCode.value, { dateStyle: 'long' }).format(new Date(`${key}T12:00:00`))
}

const groups = computed(() => {
  const result = new Map<string, Notification[]>()
  for (const item of filteredItems.value) {
    const key = dateKey(item.createdAt)
    result.set(key, [...(result.get(key) ?? []), item])
  }
  return [...result].map(([key, groupItems]) => ({ key, label: groupLabel(key), items: groupItems }))
})

function formatTime(value: string) {
  return new Intl.DateTimeFormat(localeCode.value, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function errorMessage(cause: any) {
  return cause?.data?.statusMessage ?? cause?.data?.message ?? cause?.message ?? t('common.error')
}

function markLocallyRead(ids: string[]) {
  const readAt = new Date().toISOString()
  items.value = items.value.map(item => ids.includes(item.id) ? { ...item, readAt } : item)
  ids.forEach(() => notificationState.markRead())
}

async function retry() {
  actionError.value = ''
  await refresh()
}

async function read(item: Notification) {
  if (itemPendingId.value || markAllPending.value) return
  actionError.value = ''
  itemPendingId.value = item.id
  try {
    if (!item.readAt) {
      await $fetch(`/api/notifications/${item.id}/read`, { method: 'POST' })
      markLocallyRead([item.id])
    }
    await navigateTo(item.href)
  } catch (cause: any) {
    actionError.value = errorMessage(cause)
  } finally {
    itemPendingId.value = null
  }
}

async function markAllRead() {
  if (!unreadCount.value || markAllPending.value) return
  actionError.value = ''
  markAllPending.value = true
  try {
    await $fetch('/api/notifications/read-all', { method: 'POST' })
    markLocallyRead(items.value.filter(item => !item.readAt).map(item => item.id))
  } catch (cause: any) {
    actionError.value = errorMessage(cause)
  } finally {
    markAllPending.value = false
  }
}

watch(notificationState.revision, () => {
  if (status.value !== 'pending') void refresh()
})
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('notifications.title')" />

    <div class="mx-auto max-w-4xl space-y-4">
      <div v-if="status === 'pending'" class="space-y-5" aria-busy="true">
        <div class="flex items-center justify-between gap-3"><USkeleton class="h-11 w-44 rounded-xl" /><USkeleton class="h-11 w-36 rounded-xl" /></div>
        <section v-for="group in 2" :key="group" class="space-y-2">
          <USkeleton class="h-5 w-24 rounded" />
          <div class="notification-list surface overflow-hidden">
            <div v-for="item in 2" :key="item" class="flex min-h-18 items-center gap-3 px-4 py-3 sm:px-5">
              <USkeleton class="size-10 shrink-0 rounded-xl" />
              <span class="min-w-0 flex-1 space-y-1"><USkeleton class="h-4 w-2/5 rounded" /><USkeleton class="h-3 w-4/5 rounded" /></span>
              <USkeleton class="h-4 w-10 shrink-0 rounded" />
            </div>
          </div>
        </section>
      </div>

      <template v-else>
        <UAlert v-if="visibleError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="visibleError">
          <template #actions><UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="retry">{{ t('notifications.retry') }}</UButton></template>
        </UAlert>

        <UAlert v-if="push.visible.value" color="primary" variant="soft" icon="i-lucide-bell-ring" :title="t('notifications.pushTitle')" :description="pushDescription">
          <template #actions>
            <UButton v-if="push.canSubscribe.value" size="sm" class="min-h-11 active:scale-[0.96] transition-transform" color="primary" :loading="push.pending.value" icon="i-lucide-bell-ring" @click="push.subscribe">{{ t('notifications.enablePush') }}</UButton>
            <UButton v-else-if="push.canUnsubscribe.value" size="sm" class="min-h-11 active:scale-[0.96] transition-transform" color="neutral" variant="soft" :loading="push.pending.value" icon="i-lucide-bell-off" @click="push.unsubscribe">{{ t('notifications.disablePush') }}</UButton>
          </template>
        </UAlert>

        <div v-if="items.length" class="surface flex flex-wrap items-center justify-between gap-3 p-2 sm:p-3">
          <div class="flex min-h-11 items-center gap-1 rounded-xl bg-[var(--color-surface-muted)] p-1" role="group" :aria-label="t('notifications.title')">
            <UButton size="sm" :color="filter === 'all' ? 'primary' : 'neutral'" :variant="filter === 'all' ? 'solid' : 'ghost'" :aria-pressed="filter === 'all'" @click="filter = 'all'">{{ t('notifications.all', { count: items.length }) }}</UButton>
            <UButton size="sm" :color="filter === 'unread' ? 'primary' : 'neutral'" :variant="filter === 'unread' ? 'solid' : 'ghost'" :aria-pressed="filter === 'unread'" @click="filter = 'unread'">{{ t('notifications.unread', { count: unreadCount }) }}</UButton>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-check-check" :loading="markAllPending" :disabled="!unreadCount || Boolean(itemPendingId)" @click="markAllRead">{{ t('notifications.markAllRead') }}</UButton>
        </div>

        <div v-if="groups.length" class="space-y-5">
          <section v-for="group in groups" :key="group.key" class="space-y-2">
            <h2 class="px-1 text-sm font-semibold text-[var(--color-muted)]">{{ group.label }}</h2>
            <div class="notification-list surface overflow-hidden">
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                class="group relative flex min-h-18 w-full items-center gap-3 px-4 py-3 text-start transition-[background-color] duration-150 hover:bg-[var(--color-surface-muted)] focus-visible:z-10 focus-visible:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)] disabled:cursor-progress sm:px-5"
                :class="{ 'notification-row--unread': !item.readAt }"
                :disabled="Boolean(itemPendingId) || markAllPending"
                @click="read(item)"
              >
                <span class="grid size-10 shrink-0 place-items-center rounded-xl transition-[scale] duration-150 group-active:scale-[.96]" :class="notificationAppearance[item.type].className">
                  <UIcon :name="notificationAppearance[item.type].icon" class="size-5" />
                </span>
                <span class="block min-w-0 flex-1 text-start">
                  <strong class="block truncate leading-5" :class="item.readAt ? 'font-semibold' : 'font-bold'">{{ item.title }}</strong>
                  <span class="mt-0.5 block truncate text-sm leading-5 text-[var(--color-muted)]">{{ item.body }}</span>
                </span>
                <UIcon v-if="itemPendingId === item.id" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-[var(--color-muted)]" />
                <time v-else class="min-w-11 shrink-0 text-end text-xs tabular-nums text-[var(--color-muted)]" :datetime="item.createdAt">{{ formatTime(item.createdAt) }}</time>
              </button>
            </div>
          </section>
        </div>

        <EmptyState v-else-if="filter === 'unread'" icon="i-lucide-check-check" :title="t('notifications.emptyUnreadTitle')" :description="t('notifications.emptyUnreadDescription')" />
        <EmptyState v-else icon="i-lucide-bell" :title="t('notifications.emptyTitle')" :description="t('notifications.emptyDescription')" />
      </template>
    </div>
  </section>
</template>

<style scoped>
.notification-list > * + * {
  border-top: 1px solid rgba(23, 51, 38, 0.055);
}

.notification-row--unread {
  background-color: #dceee5;
}

.notification-row--unread:hover {
  background-color: #d2e8dd;
}
</style>
