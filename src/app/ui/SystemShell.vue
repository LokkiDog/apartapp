<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import CrmBrandMark from './CrmBrandMark.vue'
import { PasskeySettings } from '#fsd/features/manage-passkeys'
import type { DropdownMenuItem } from '@nuxt/ui'

const user = useCurrentUser()
const route = useRoute()
const identity = computed(() => user.value?.isSuperuser ? user.value.id : undefined)
const { data: unread, refresh: refreshUnread } = useAsyncData(
  'system-notifications-unread',
  () => identity.value ? $fetch<{ count: number }>('/api/system/notifications/unread') : Promise.resolve({ count: 0 }),
  { server: false, default: () => ({ count: 0 }), watch: [identity, () => route.path] }
)
function refreshUnreadOnFocus() {
  if (identity.value) void refreshUnread()
}
onMounted(() => window.addEventListener('focus', refreshUnreadOnFocus))
onUnmounted(() => window.removeEventListener('focus', refreshUnreadOnFocus))

const { t } = useI18n()
const error = ref('')
const logoutPending = ref(false)
const initials = computed(() => user.value?.name?.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase())
const accountActions = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('account.profile'), icon: 'i-lucide-user-round', to: '/system/profile' }],
  [{ label: t('common.logout'), icon: 'i-lucide-log-out', disabled: logoutPending.value, onSelect: logout }]
])

async function logout() {
  if (logoutPending.value) return
  logoutPending.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await useUserSession().clear()
    await navigateTo('/login')
  } catch {
    error.value = 'Не удалось выйти'
  } finally {
    logoutPending.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
      <div class="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-4 py-2 sm:px-8">
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="brand-mark"><CrmBrandMark /></div>
          <span class="hidden border-s border-[var(--color-line)] ps-3 text-sm text-[var(--color-muted)] sm:block">Панель управления</span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UDropdownMenu :items="accountActions" :content="{ align: 'end' }" :ui="{ item: 'min-h-11 cursor-pointer' }">
            <UButton
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-chevron-down"
              aria-label="Меню аккаунта"
              :loading="logoutPending"
              :disabled="logoutPending"
            >
              <span class="flex size-8 items-center justify-center rounded-full border border-[var(--color-line)] text-xs text-[var(--color-primary)]">
                <span v-if="initials">{{ initials }}</span>
                <UIcon v-else name="i-lucide-user-round" class="size-4" />
              </span>
              <span v-if="user?.name" class="hidden max-w-44 truncate sm:block">{{ user.name }}</span>
            </UButton>
          </UDropdownMenu>
        </div>
      </div>
      <div class="border-t border-[var(--color-line)]">
        <nav aria-label="Управление системой" class="mx-auto flex max-w-[1440px] flex-wrap gap-x-1 px-2 sm:gap-x-2 sm:px-8">
          <NuxtLink to="/system/clients" class="system-tab">Клиенты</NuxtLink>
          <NuxtLink to="/system/settings" class="system-tab">Настройки системы</NuxtLink>
          <NuxtLink to="/system/notifications" class="system-tab gap-1">
            Уведомления
            <UBadge v-if="unread.count" color="primary" variant="soft" size="xs" :aria-label="`Непрочитанных: ${unread.count}`">{{ unread.count > 99 ? '99+' : unread.count }}</UBadge>
          </NuxtLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-[1440px] px-4 py-4 sm:px-8 sm:py-6">
      <UAlert v-if="error" :description="error" color="error" role="alert" class="mb-4" />
      <slot />
    </main>
    <PasskeySettings :show-trigger="false" />
  </div>
</template>

<style scoped>
.system-tab {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border-bottom: 2px solid transparent;
  padding-inline: 0.5rem;
  color: var(--color-muted);
  font-size: 0.875rem;
  font-weight: 600;
}
.system-tab:hover,
.system-tab:active {
  background: var(--color-surface-muted);
  color: var(--color-primary);
}
.system-tab[aria-current="page"] {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
}
.system-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
</style>
