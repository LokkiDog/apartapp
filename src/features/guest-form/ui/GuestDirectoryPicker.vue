<script setup lang="ts">
import { ResponsiveFormDialog } from '#fsd/shared/ui'
import type { GuestSummary } from '@contracts/guests'

const props = defineProps<{ pickerKey: string; saveGuest: (guest: GuestSummary) => Promise<GuestSummary>; currentGuestId?: string | null }>()
const emit = defineEmits<{ saved: [guest: GuestSummary] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const search = ref('')
const query = ref('')
const page = ref(1)
const pending = ref(false)
const error = ref('')
const selectedGuest = ref<string>()

watch(search, (value, _, onCleanup) => {
  const timer = setTimeout(() => {
    page.value = 1
    query.value = value.trim()
  }, 250)
  onCleanup(() => clearTimeout(timer))
})

const { data, status, refresh } = await useAsyncData(
  `guest-directory-picker-${props.pickerKey}`,
  () => open.value
    ? $fetch<{ items: GuestSummary[]; hasMore: boolean }>('/api/guests', { query: { q: query.value, page: page.value } })
    : Promise.resolve({ items: [], hasMore: false }),
  { server: false, default: () => ({ items: [], hasMore: false }), watch: [open, query, page] },
)

watch(open, value => {
  if (value) return
  search.value = ''
  query.value = ''
  page.value = 1
  selectedGuest.value = undefined
  error.value = ''
})

async function linkGuest() {
  if (!selectedGuest.value || pending.value) return
  pending.value = true
  error.value = ''
  try {
    const selected = data.value.items.find(guest => guest.id === selectedGuest.value)
    if (!selected || selected.id === props.currentGuestId) return
    const guest = await props.saveGuest(selected)
    open.value = false
    emit('saved', guest)
  } catch (cause: any) {
    error.value = cause?.data?.data?.code === 'GUEST_MESSAGING_CONFLICT'
      ? t('guests.messagingConflict') : t('common.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <ResponsiveFormDialog :modal="true" :overlay="true" v-model:open="open" :title="t(currentGuestId ? 'guests.relinkGuest' : 'guests.linkGuest')" :dismissible="!pending">
    <template #body>
      <div class="space-y-3">
        <slot />
        <UInput v-model="search" icon="i-lucide-search" maxlength="160" :aria-label="t('guests.search')" :placeholder="t('guests.search')" class="w-full" :ui="{ base: 'min-h-11' }" />
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
        <p v-if="status === 'pending' || status === 'idle'" role="status">{{ t('guests.loading') }}</p>
        <UAlert v-else-if="status === 'error'" color="error" variant="soft" :description="t('common.error')" :actions="[{ label: t('guests.retry'), onClick: () => refresh() }]" />
        <fieldset v-else-if="data.items.length" class="divide-y divide-[var(--color-line)]">
          <legend class="sr-only">{{ t('guests.linkGuest') }}</legend>
          <label v-for="guest in data.items" :key="guest.id" class="flex min-h-11 cursor-pointer items-center gap-3 px-2 py-1 hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-primary-soft)]">
            <input v-model="selectedGuest" type="radio" name="conversation-guest" :value="guest.id" :disabled="pending || guest.id === currentGuestId" class="size-4 shrink-0 accent-[var(--color-primary)]">
            <span class="min-w-0">
              <strong class="block break-words">{{ guest.name || t('guests.unnamed') }}</strong>
              <span v-if="guest.phone || guest.email || guest.whatsapp" class="block break-words text-sm text-[var(--color-muted)]" dir="auto">{{ [guest.phone || guest.whatsapp, guest.email].filter(Boolean).join(' · ') }}</span>
            </span>
          </label>
        </fieldset>
        <p v-else>{{ t(query ? 'guests.noResults' : 'guests.empty') }}</p>
        <div v-if="page > 1 || data.hasMore" class="flex items-center gap-3">
          <UButton class="min-h-11" color="neutral" variant="outline" :disabled="page <= 1 || status === 'pending' || pending" @click="page--">{{ t('guests.previous') }}</UButton>
          <span class="tabular-nums">{{ page }}</span>
          <UButton class="min-h-11" color="neutral" variant="outline" :disabled="!data.hasMore || status === 'pending' || pending" @click="page++">{{ t('guests.next') }}</UButton>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton class="min-h-11" color="neutral" variant="ghost" :disabled="pending" @click="open = false">{{ t('common.cancel') }}</UButton>
        <UButton class="min-h-11" :disabled="status !== 'success' || !data.items.some(guest => guest.id === selectedGuest)" :loading="pending" @click="linkGuest">{{ t(currentGuestId ? 'guests.relink' : 'guests.link') }}</UButton>
      </div>
    </template>
  </ResponsiveFormDialog>
</template>
