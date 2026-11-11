<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ apartmentId: string; apartmentName: string }>()
const emit = defineEmits<{ synced: [] }>()
const { t } = useI18n()
const user = useCurrentUser()
type Feed = { apartmentId: string; url: string; enabled: boolean; lastSyncedAt: string | null; lastError: string }
const open = ref(false)
const url = ref('')
const busy = ref(false)
const message = ref('')
const { data: feeds, status, error: loadError, refresh } = await useAsyncData(
  `apartment-booking-integration-${props.apartmentId}`,
  () => user.value ? $fetch<Feed[]>('/api/calendar-import/feeds') : Promise.resolve([]),
  { server: false, default: () => [], watch: [user, () => props.apartmentId] },
)
const feed = computed(() => feeds.value.find(item => item.apartmentId === props.apartmentId) ?? null)
const loading = computed(() => !user.value || status.value === 'pending' || status.value === 'idle')
const hasError = computed(() => Boolean(loadError.value || feed.value?.lastError))
const statusLabel = computed(() => loading.value ? t('integrations.loading') : hasError.value ? t('integrations.error') : feed.value?.enabled ? t('integrations.connected') : t('integrations.disconnected'))
watch(feed, value => { url.value = value?.url ?? '' }, { immediate: true })
watch(open, value => {
  if (value) { url.value = feed.value?.url ?? ''; message.value = '' }
})

async function save(nextUrl = url.value) {
  busy.value = true; message.value = ''
  try {
    await $fetch(`/api/calendar-import/${props.apartmentId}`, { method: 'PUT', body: { url: nextUrl.trim() } })
    await refresh(); emit('synced')
  } catch (error: any) { message.value = error?.data?.statusMessage || t('common.error') }
  finally { busy.value = false }
}
async function sync() {
  busy.value = true; message.value = ''
  try { await $fetch(`/api/calendar-import/${props.apartmentId}/sync`, { method: 'POST' }); await refresh(); emit('synced') }
  catch (error: any) { message.value = error?.data?.statusMessage || t('common.error') }
  finally { busy.value = false }
}
</script>

<template>
  <div>
    <button type="button" class="integration-row" :disabled="loading" aria-haspopup="dialog" :aria-expanded="open" @click="open = true">
      <UIcon name="i-lucide-calendar-sync" class="size-5 shrink-0 text-[var(--color-muted)]" />
      <span class="min-w-0 flex-1 truncate font-medium">Booking.com</span>
      <span class="integration-row__status" :class="{ 'text-error': hasError, 'text-success': !hasError && feed?.enabled }">{{ statusLabel }}</span>
      <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-[var(--color-muted)] rtl:rotate-180" />
    </button>

    <USlideover v-model:open="open" title="Booking.com" :description="apartmentName" :modal="true" :overlay="true">
      <template #body>
        <form :id="`booking-integration-${apartmentId}`" class="space-y-4" @submit.prevent="save()">
          <p class="text-sm text-[var(--color-muted)]">{{ t('icalImport.hint') }}</p>
          <UAlert v-if="loadError" color="error" orientation="horizontal" variant="soft" :title="t('common.error')">
            <template #actions><UButton color="error" variant="ghost" type="button" class="min-h-11" :loading="loading" @click="refresh()">{{ t('integrations.retry') }}</UButton></template>
          </UAlert>
          <UFormField :label="t('integrations.calendarUrl')">
            <UInput v-model="url" type="url" class="w-full" :placeholder="t('icalImport.urlPlaceholder')" autocomplete="off" :disabled="busy || loading || Boolean(loadError)" />
          </UFormField>
          <UAlert v-if="feed?.lastError" color="error" role="alert" :description="feed.lastError" />
          <p v-else-if="feed?.lastSyncedAt" class="text-sm text-[var(--color-muted)]">{{ t('icalImport.lastSync') }}: {{ new Date(feed.lastSyncedAt).toLocaleString() }}</p>
          <div v-if="feed?.enabled" class="flex flex-wrap gap-2">
            <UButton type="button" color="neutral" variant="soft" icon="i-lucide-refresh-cw" class="min-h-11" :loading="busy" :disabled="busy || loading || Boolean(loadError)" @click="sync">{{ t('icalImport.syncNow') }}</UButton>
            <UButton type="button" color="neutral" variant="ghost" class="min-h-11" :disabled="busy || loading || Boolean(loadError)" @click="save('')">{{ t('icalImport.disconnect') }}</UButton>
          </div>
          <UAlert v-if="message" color="error" role="alert" :description="message" />
        </form>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton color="neutral" variant="ghost" class="min-h-11" @click="open = false">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" :form="`booking-integration-${apartmentId}`" class="min-h-11" :loading="busy" :disabled="busy || loading || Boolean(loadError)">{{ feed?.enabled ? t('common.save') : t('icalImport.connect') }}</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<style scoped>
.integration-row { display: flex; width: 100%; min-height: 60px; align-items: center; gap: .75rem; padding: .75rem 0; text-align: start; cursor: pointer; transition: background-color 150ms ease; }
.integration-row:hover:not(:disabled), .integration-row:focus-visible { background-color: var(--color-surface-muted); }
.integration-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.integration-row:active:not(:disabled) { background-color: var(--color-primary-soft); }
.integration-row:disabled { cursor: wait; }
.integration-row__status { flex-shrink: 0; font-size: .75rem; color: var(--color-muted); }
.integration-row__status.text-error { color: var(--tone-danger-ink); }
.integration-row__status.text-success { color: var(--tone-success-ink); }
@media (prefers-reduced-motion: reduce) { .integration-row { transition: none; } }
</style>
