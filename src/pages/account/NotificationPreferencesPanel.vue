<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { usePushSubscription } from '#fsd/features/manage-push-subscription'
import { notificationChannels, notificationEvents, type NotificationPreference } from '@contracts/notification-preferences'
import type { AppLocale } from '@contracts/crm'
import { useNotificationPreferenceDraft, type PreferenceSnapshot } from './model/notification-preference-draft'

const { t, locale } = useI18n()
const user = useCurrentUser()
const identity = computed(() => user.value ? `${user.value.id}:${user.value.organizationId}:${user.value.contextRevision ?? ''}` : '')
const { data, status, error: loadError, refresh } = await useAsyncData('account-notification-preferences', async (): Promise<PreferenceSnapshot | null> => {
  const current = identity.value
  if (!current) return null
  const rows = await $fetch<NotificationPreference[]>('/api/users/me/notification-preferences')
  return { identity: current, rows }
}, { server: false, default: () => null, watch: [identity, () => user.value?.roles.join(',')] })
const { rows, changes, changed, accept } = useNotificationPreferenceDraft(identity, data)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const groups = computed(() => ['bookings', 'cleanings', 'tasks', 'problems', 'reports', 'messages'].map(category => ({
  category,
  rows: rows.value.filter(row => notificationEvents.find(event => event.key === row.event)?.category === category)
})).filter(group => group.rows.length))
function label(key: string) { return notificationEvents.find(event => event.key === key)?.label[locale.value as AppLocale] ?? key }
const push = usePushSubscription()
const pushReady = ref(false)
const pushDescription = computed(() => !push.supported.value ? t('notificationSettings.pushUnsupported') : t(`notifications.push${push.description.value[0]!.toUpperCase()}${push.description.value.slice(1)}`))
onMounted(() => {
  pushReady.value = true
  void push.refresh().catch(() => { push.error.value = 'error' })
})
watch(rows, () => { error.value = ''; notice.value = '' }, { deep: true })
async function save() {
  if (pending.value || !changed.value || !identity.value) return
  const current = identity.value
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const saved = await $fetch<NotificationPreference[]>('/api/users/me/notification-preferences', { method: 'PATCH', body: { changes: changes.value.map(row => ({ ...row })) } })
    if (identity.value !== current) return
    accept(saved)
    await nextTick()
    notice.value = t('notificationSettings.saved')
  } catch { if (identity.value === current) error.value = t('notificationSettings.saveError') }
  finally { pending.value = false }
}
</script>

<template>
  <section class="surface min-w-0 space-y-6 p-5 sm:p-6">
    <header class="space-y-1">
      <h2 class="text-lg font-semibold leading-6">{{ t('notificationSettings.title') }}</h2>
      <p class="text-pretty text-sm leading-5 text-[var(--color-muted)]">{{ t('notificationSettings.description') }}</p>
    </header>
    <div v-if="pushReady" class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <h3 class="text-sm font-semibold">{{ t('notifications.pushTitle') }}</h3>
        <p class="text-pretty text-sm text-[var(--color-muted)]" role="status">{{ pushDescription }}</p>
      </div>
      <UButton v-if="push.canSubscribe.value" color="neutral" variant="soft" icon="i-lucide-bell-ring" :loading="push.pending.value" :disabled="push.pending.value" @click="push.subscribe">{{ t('notifications.enablePush') }}</UButton>
      <UButton v-else-if="push.canUnsubscribe.value" color="neutral" variant="soft" icon="i-lucide-bell-off" :loading="push.pending.value" :disabled="push.pending.value" @click="push.unsubscribe">{{ t('notifications.disablePush') }}</UButton>
    </div>
    <UAlert v-if="loadError" color="error" :description="t('notificationSettings.loadError')"><template #actions><UButton color="neutral" variant="soft" @click="refresh()">{{ t('notifications.retry') }}</UButton></template></UAlert>
    <div v-if="!rows.length && !loadError" class="space-y-3"><USkeleton v-for="item in 4" :key="item" class="h-11 w-full rounded-lg" /></div>
    <div v-for="group in groups" :key="group.category" class="min-w-0">
      <table class="notification-preferences-table w-full table-fixed border-collapse text-sm">
        <caption class="pb-3 text-start font-semibold">{{ t(`notificationSettings.categories.${group.category}`) }}</caption>
        <thead><tr>
          <th scope="col" class="text-start font-normal text-[var(--color-muted)]"><span class="sr-only">{{ t('notificationSettings.event') }}</span></th>
          <th v-for="channel in notificationChannels" :key="channel" scope="col" class="w-12 pb-1 text-center text-xs font-medium text-[var(--color-muted)] sm:w-20">{{ channel === 'crm' ? 'CRM' : channel === 'push' ? 'Push' : 'Email' }}</th>
        </tr></thead>
        <tbody><tr v-for="row in group.rows" :key="row.event">
          <th scope="row" class="py-3 pe-2 text-start align-middle font-normal leading-5 break-words">{{ label(row.event) }}</th>
          <td v-for="channel in notificationChannels" :key="channel" class="align-middle">
            <UCheckbox as="label" v-model="row[channel]" :disabled="pending || status === 'pending' || !!loadError" :aria-label="`${label(row.event)}: ${channel === 'crm' ? 'CRM' : channel === 'push' ? 'Push' : 'Email'}`" :ui="{ root: 'min-h-11 min-w-11 justify-center p-0 cursor-pointer has-disabled:cursor-not-allowed', container: 'items-center' }" />
          </td>
        </tr></tbody>
      </table>
    </div>
    <UAlert v-if="error" color="error" :description="error" role="alert" />
    <UAlert v-if="notice" color="success" :description="notice" role="status" />
    <div class="form-actions form-actions--footer"><UButton class="ms-auto" icon="i-lucide-check" :loading="pending" :disabled="pending || !changed || !identity || status === 'pending' || !!loadError" @click="save">{{ t('common.save') }}</UButton></div>
  </section>
</template>

<style scoped>
.notification-preferences-table tbody tr + tr {
  border-top: 1px solid color-mix(in srgb, var(--color-line) 55%, transparent);
}
</style>
