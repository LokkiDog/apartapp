<script setup lang="ts">
import { useCurrentUser } from '#fsd/shared/auth'
import { useNetworkStatus } from '#fsd/shared/lib'

type NavItem = { to: string; label: string; icon: string }
const route = useRoute()
const user = useCurrentUser()
const online = useNetworkStatus()
const moreOpen = ref(false)

const work: NavItem[] = [
  { to: '/', label: 'Главная', icon: 'i-lucide-layout-dashboard' },
  { to: '/calendar', label: 'Заезды', icon: 'i-lucide-calendar-days' },
  { to: '/work', label: 'Уборки', icon: 'i-lucide-sparkles' }
]
const objects: NavItem[] = [
  { to: '/apartments', label: 'Апартаменты', icon: 'i-lucide-building-2' },
  { to: '/hotels', label: 'Отели', icon: 'i-lucide-hotel' },
  { to: '/inventory', label: 'Остатки', icon: 'i-lucide-package' }
]
const reports: NavItem[] = [{ to: '/reports', label: 'Сводные отчёты', icon: 'i-lucide-chart-no-axes-combined' }]
const managerFinance: NavItem[] = [{ to: '/statement', label: 'Мои расходы', icon: 'i-lucide-wallet-cards' }]
const settings: NavItem[] = [
  { to: '/settings/users', label: 'Пользователи', icon: 'i-lucide-users' },
  { to: '/settings/apartment-types', label: 'Типы и тарифы', icon: 'i-lucide-badge-euro' },
  { to: '/settings/services', label: 'Доп. услуги', icon: 'i-lucide-concierge-bell' }
]

const groups = computed(() => {
  if (user.value?.roles.includes('administrator')) return [
    { label: 'Работа', items: work }, { label: 'Объекты', items: objects }, { label: 'Отчёты', items: reports }, { label: 'Настройки', items: settings }
  ]
  if (user.value?.roles.includes('manager')) return [
    { label: 'Работа', items: work }, { label: 'Объекты', items: objects.filter(item => !['/hotels', '/inventory'].includes(item.to)) }, { label: 'Финансы', items: managerFinance }
  ]
  return [{ label: 'Работа', items: work.filter(item => ['/', '/work'].includes(item.to)) }]
})
const allItems = computed(() => groups.value.flatMap(group => group.items))
const mobilePrimary = computed(() => {
  const preferred = ['/', '/calendar', '/work', '/apartments']
  return preferred.map(path => allItems.value.find(item => item.to === path)).filter(Boolean) as NavItem[]
})
const mobileMore = computed(() => allItems.value.filter(item => !mobilePrimary.value.some(primary => primary.to === item.to)))
const roleLabel = computed(() => user.value?.roles.includes('administrator') ? 'Администратор' : user.value?.roles.includes('manager') ? 'Управляющий' : 'Исполнитель')
function active(to: string) { return to === '/' ? route.path === '/' : route.path.startsWith(to) }
async function logout() { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
</script>

<template>
  <div class="app-shell">
    <p v-if="!online" class="offline-banner">Нет соединения с интернетом. Данные CRM сейчас недоступны.</p>

    <aside class="desktop-sidebar">
      <NuxtLink to="/" class="brand-mark">aparts<span>.</span></NuxtLink>
      <nav class="mt-8 flex-1 space-y-6" aria-label="Основная навигация">
        <section v-for="group in groups" :key="group.label">
          <p class="nav-group-label">{{ group.label }}</p>
          <div class="mt-2 space-y-1">
            <NuxtLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item--active': active(item.to) }">
              <UIcon :name="item.icon" class="size-5" /><span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </section>
      </nav>
      <div class="sidebar-profile">
        <div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">{{ user?.name }}</p><p class="text-xs text-[var(--color-muted)]">{{ roleLabel }}</p></div>
        <UButton color="neutral" variant="ghost" icon="i-lucide-log-out" aria-label="Выйти" @click="logout" />
      </div>
    </aside>

    <div class="app-content">
      <header class="app-topbar">
        <NuxtLink to="/" class="brand-mark lg:hidden">aparts<span>.</span></NuxtLink>
        <div class="ml-auto flex items-center gap-1">
          <UButton to="/notifications" color="neutral" variant="ghost" icon="i-lucide-bell" aria-label="Уведомления" />
          <UButton class="lg:hidden" color="neutral" variant="ghost" icon="i-lucide-log-out" aria-label="Выйти" @click="logout" />
        </div>
      </header>
      <main class="app-main"><slot /></main>
    </div>

    <nav class="mobile-nav" aria-label="Мобильная навигация">
      <NuxtLink v-for="item in mobilePrimary" :key="item.to" :to="item.to" class="mobile-nav__item" :class="{ 'mobile-nav__item--active': active(item.to) }">
        <UIcon :name="item.icon" class="size-5" /><span>{{ item.label }}</span>
      </NuxtLink>
      <button v-if="mobileMore.length" type="button" class="mobile-nav__item" @click="moreOpen = true"><UIcon name="i-lucide-menu" class="size-5" /><span>Ещё</span></button>
    </nav>

    <UDrawer v-model:open="moreOpen" title="Разделы">
      <template #body>
        <nav class="grid gap-2 pb-[env(safe-area-inset-bottom)]">
          <NuxtLink v-for="item in mobileMore" :key="item.to" :to="item.to" class="drawer-nav-item" @click="moreOpen = false"><UIcon :name="item.icon" class="size-5" />{{ item.label }}</NuxtLink>
        </nav>
      </template>
    </UDrawer>
  </div>
</template>
