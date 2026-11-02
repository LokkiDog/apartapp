<script setup lang="ts">
import { useReleaseAnnouncement } from '#fsd/features/release-announcement'
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ mobile?: boolean; collapsed?: boolean; name?: string; roleLabel: string; logoutPending: boolean }>()
const emit = defineEmits<{ logout: [] }>()
const { t } = useI18n()
const { unread } = useReleaseAnnouncement()
const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: t('account.profile'), icon: 'i-lucide-user', to: '/profile' },
    { label: t('account.whatsNew'), icon: 'i-lucide-newspaper', to: '/whats-new', slot: 'whats-new' },
    { label: t('account.security'), icon: 'i-lucide-shield-check', to: '/security' }
  ],
  [{ label: t('common.logout'), icon: 'i-lucide-log-out', color: 'error', disabled: props.logoutPending, onSelect: () => emit('logout') }]
])
</script>

<template>
  <UDropdownMenu :items="items" :modal="false" :content="{ align: 'end', side: mobile ? 'bottom' : 'top', sideOffset: 8 }" :ui="{ content: 'min-w-56', item: 'min-h-11 items-center cursor-pointer active:bg-[var(--color-surface-muted)]' }" :class="mobile ? 'lg:hidden' : 'w-full'">
    <UButton v-if="mobile" color="neutral" variant="ghost" icon="i-lucide-user-round" class="topbar-action min-h-11 min-w-11 lg:hidden" :aria-label="t('account.menu')" :loading="logoutPending" :disabled="logoutPending" />
    <UTooltip v-else :text="`${t('account.menu')}: ${name ?? ''}`" :disabled="!collapsed">
      <UButton color="neutral" variant="ghost" :icon="collapsed ? 'i-lucide-user-round' : undefined" class="sidebar-profile w-full text-start" :class="{ 'sidebar-profile--collapsed': collapsed }" :aria-label="`${t('account.menu')}: ${name ?? ''}`" :disabled="logoutPending">
        <span v-if="!collapsed" class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">{{ name }}</span>
          <span class="block text-xs font-normal text-[var(--color-muted)]">{{ roleLabel }}</span>
        </span>
        <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-5 shrink-0 text-[var(--color-muted)]" />
      </UButton>
    </UTooltip>
    <template #whats-new-trailing><span v-if="unread" class="release-unread-dot" :aria-label="t('releaseAnnouncement.unread')" /></template>
  </UDropdownMenu>
</template>

<style scoped>
.release-unread-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-primary);
}
.sidebar-profile {
  background: var(--color-surface-muted);
  transition: background-color 150ms ease-out;
}
.sidebar-profile--collapsed {
  min-width: 44px;
  min-height: 44px;
  justify-content: center;
  padding-inline: 0;
}
.sidebar-profile:hover,
.sidebar-profile[data-state="open"] {
  background: var(--color-primary-soft);
}
.sidebar-profile:active {
  background: var(--color-surface);
}
.sidebar-profile:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-profile { transition: none; }
}
</style>
