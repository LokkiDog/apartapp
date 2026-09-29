<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = defineProps<{ apartmentId: string; apartmentName: string }>()
const emit = defineEmits<{ synced: [] }>()
const { t } = useI18n()
type Feed = { apartmentId: string; url: string; enabled: boolean; lastSyncedAt: string | null; lastError: string }
const feed = ref<Feed | null>(null)
const url = ref('')
const busy = ref(false)
const message = ref('')

async function load() {
  try { feed.value = (await $fetch<Feed[]>('/api/calendar-import/feeds')).find(item => item.apartmentId === props.apartmentId) ?? null; url.value = feed.value?.url ?? '' }
  catch { feed.value = null }
}
async function save(nextUrl = url.value) {
  busy.value = true; message.value = ''
  try {
    await $fetch(`/api/calendar-import/${props.apartmentId}`, { method: 'PUT', body: { url: nextUrl.trim() } })
    await load(); emit('synced')
  } catch (error: any) { message.value = error?.data?.statusMessage || t('common.error') }
  finally { busy.value = false }
}
async function sync() {
  busy.value = true; message.value = ''
  try { await $fetch(`/api/calendar-import/${props.apartmentId}/sync`, { method: 'POST' }); await load(); emit('synced') }
  catch (error: any) { message.value = error?.data?.statusMessage || t('common.error') }
  finally { busy.value = false }
}
watch(() => props.apartmentId, load, { immediate: true })
</script>

<template>
  <section class="mx-auto w-full max-w-[1040px] surface space-y-3 p-4" style="display: none">
      <header class="flex items-center gap-3"><span class="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-calendar-sync" class="size-5" /></span><div><h2 class="font-semibold">{{ t('icalImport.title') }}</h2><p class="text-sm text-[var(--color-muted)]">{{ apartmentName }}</p></div></header>
      <p class="text-sm text-[var(--color-muted)]">{{ t('icalImport.hint') }}</p>
      <div class="flex flex-col gap-2 sm:flex-row">
        <UInput v-model="url" type="url" class="w-full" :placeholder="t('icalImport.urlPlaceholder')" autocomplete="off" />
        <div class="flex flex-wrap gap-2">
          <UButton :loading="busy" :disabled="busy" @click="save()">{{ feed?.enabled ? t('common.save') : t('icalImport.connect') }}</UButton>
          <UButton v-if="feed?.enabled" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="busy" :disabled="busy" @click="sync">{{ t('icalImport.syncNow') }}</UButton>
          <UButton v-if="feed?.enabled" color="neutral" variant="ghost" :disabled="busy" @click="save('')">{{ t('icalImport.disconnect') }}</UButton>
        </div>
      </div>
      <p v-if="feed?.lastError" class="text-sm text-error">{{ feed.lastError }}</p>
      <p v-else-if="feed?.lastSyncedAt" class="text-xs text-[var(--color-muted)]">{{ t('icalImport.lastSync') }}: {{ new Date(feed.lastSyncedAt).toLocaleString() }}</p>
        <p v-if="message" role="alert" class="text-sm text-error">{{ message }}</p>
  </section>
</template>
