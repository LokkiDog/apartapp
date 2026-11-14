<script setup lang="ts">
import type { GuestSummary } from '@contracts/guests'
import { useCurrentUser, useCurrentUserScope } from '#fsd/shared/auth'
import { EmptyState, PageHeader } from '#fsd/shared/ui'
import { GuestForm } from '#fsd/features/guest-form'

const { t } = useI18n()
const user = useCurrentUser()
const userScope = useCurrentUserScope()
const search = ref('')
const query = ref('')
const page = ref(1)
const formOpen = ref(false)
const allowed = computed(() => user.value?.guestsEnabled && user.value.roles.includes('administrator') && !user.value.inSystem)
watch(search, (value, _, onCleanup) => {
  const timer = setTimeout(() => { page.value = 1; query.value = value.trim() }, 250)
  onCleanup(() => clearTimeout(timer))
})
watch(userScope, () => { page.value = 1; formOpen.value = false })
const { data, status, refresh } = await useAsyncData(computed(() => `guests-directory-${userScope.value}`), () => {
  if (!allowed.value) return Promise.resolve({ items: [], hasMore: false })
  return $fetch('/api/guests', { query: { q: query.value, page: page.value } })
}, { server: false, default: () => ({ items: [], hasMore: false }), watch: [query, page] })

function openGuest(guest: GuestSummary) {
  return navigateTo(`/guests/${guest.id}`)
}
</script>

<template>
  <section v-if="allowed" class="page-wrap space-y-4">
    <PageHeader :title="t('guests.title')">
      <template #actions><UButton class="min-h-11" icon="i-lucide-plus" @click="formOpen = true">{{ t('guests.add') }}</UButton></template>
    </PageHeader>
    <UInput v-model="search" icon="i-lucide-search" maxlength="160" :aria-label="t('guests.search')" :placeholder="t('guests.search')" class="w-full sm:max-w-sm" :ui="{ base: 'min-h-11' }" />
    <p v-if="status === 'pending' || status === 'idle'" role="status">{{ t('guests.loading') }}</p>
    <UAlert v-else-if="status === 'error'" color="error" variant="soft" :description="t('common.error')" :actions="[{ label: t('guests.retry'), onClick: () => refresh() }]" />
    <ul v-else-if="data?.items.length" class="surface divide-y divide-[var(--color-line)] overflow-hidden">
      <li v-for="guest in data.items" :key="guest.id">
        <NuxtLink :to="`/guests/${guest.id}`" class="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-primary-soft)]">
          <span class="min-w-0">
            <strong class="block truncate">{{ guest.name || t('guests.unnamed') }}</strong>
            <span v-if="guest.phone || guest.email || guest.whatsapp" class="block truncate text-sm text-[var(--color-muted)]" dir="auto">{{ [guest.phone || guest.whatsapp, guest.email].filter(Boolean).join(' · ') }}</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="shrink-0 rtl:rotate-180" />
        </NuxtLink>
      </li>
    </ul>
    <EmptyState v-else icon="i-lucide-contact" :title="t(query ? 'guests.noResults' : 'guests.empty')" />
    <nav v-if="page > 1 || data?.hasMore" :aria-label="t('guests.title')" class="flex items-center gap-3">
      <UButton class="min-h-11" color="neutral" variant="outline" :disabled="page <= 1 || status === 'pending'" @click="page--">{{ t('guests.previous') }}</UButton>
      <span class="tabular-nums">{{ page }}</span>
      <UButton class="min-h-11" color="neutral" variant="outline" :disabled="!data?.hasMore || status === 'pending'" @click="page++">{{ t('guests.next') }}</UButton>
    </nav>
    <GuestForm v-model:open="formOpen" @saved="openGuest" />
  </section>
</template>
