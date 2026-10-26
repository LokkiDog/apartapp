<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ mobile?: boolean; name?: string; roleLabel: string; logoutPending: boolean }>()
const emit = defineEmits<{ logout: [] }>()
const { t } = useI18n()
const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: t('account.profile'), icon: 'i-lucide-user', to: '/profile' },
    { label: t('account.whatsNew'), icon: 'i-lucide-newspaper', to: '/whats-new' },
    { label: t('account.security'), icon: 'i-lucide-shield-check', to: '/security' }
  ],
  [{ label: t('common.logout'), icon: 'i-lucide-log-out', color: 'error', disabled: props.logoutPending, onSelect: () => emit('logout') }]
])
</script>

<template>
  <UDropdownMenu :items="items" :modal="false" :content="{ align: 'end', side: mobile ? 'bottom' : 'top', sideOffset: 8 }" :ui="{ content: 'min-w-56', item: 'min-h-11 items-center cursor-pointer active:bg-[var(--color-surface-muted)]' }" :class="mobile ? 'lg:hidden' : 'w-full'">
    <UButton v-if="mobile" color="neutral" variant="ghost" icon="i-lucide-user-round" class="topbar-action min-h-11 min-w-11 lg:hidden" :aria-label="t('account.menu')" :loading="logoutPending" :disabled="logoutPending" />
    <UButton v-else color="neutral" variant="ghost" class="sidebar-profile w-full text-start" :aria-label="`${t('account.menu')}: ${name ?? ''}`" :disabled="logoutPending">
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold">{{ name }}</span>
        <span class="block text-xs font-normal text-[var(--color-muted)]">{{ roleLabel }}</span>
      </span>
      <UIcon name="i-lucide-chevrons-up-down" class="size-5 shrink-0 text-[var(--color-muted)]" />
    </UButton>
  </UDropdownMenu>
</template>

<style scoped>
.sidebar-profile {
  background: var(--color-surface-muted);
  transition: background-color 150ms ease-out;
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
