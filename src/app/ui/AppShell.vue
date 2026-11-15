<script setup lang="ts">
import CrmBrandMark from "./CrmBrandMark.vue";
import {
  switchClientContext,
  getCrmNavigation,
  type NavItem,
  useCurrentUser,
  usesManagerOnlyNavigation,
} from "#fsd/shared/auth";
import { useNetworkStatus } from "#fsd/shared/lib";
import { useNotificationState } from "#fsd/features/manage-notifications";
import { unregisterPushSubscription } from "#fsd/features/manage-push-subscription";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { PasskeySettings } from "#fsd/features/manage-passkeys";
import UserMenu from "./UserMenu.vue";
import { ReleaseAnnouncement, useReleaseAnnouncement } from "#fsd/features/release-announcement";
const releaseAnnouncements = useReleaseAnnouncement();
const { t, localeProperties } = useI18n();
const sidebarCollapsed = ref(false);
const sidebarStorageKey = "aparts:sidebar-collapsed";
const sidebarToggleLabel = computed(() =>
  t(sidebarCollapsed.value ? "nav.expandMenu" : "nav.collapseMenu"),
);
const sidebarTooltipContent = computed(() => ({
  side: localeProperties.value.dir === "rtl" ? "left" as const : "right" as const,
  sideOffset: 8,
}));
function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  try {
    localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed.value));
  } catch { /* The menu remains usable when storage is unavailable. */ }
}

const route = useRoute();
const user = useCurrentUser();
const online = useNetworkStatus();
const notifications = useNotificationState();
const userSession = useUserSession();
const moreOpen = ref(false);
const logoutPending = ref(false);
const mobileNavigationReady = ref(false);
const notificationsReady = ref(false);
const isAdministrator = computed(() => user.value?.roles.includes("administrator") ?? false);
const messageCount = computed(() => user.value?.messagingEnabled && isAdministrator.value ? notifications.messagingUnreadCount.value : 0);
const messageBadge = computed(() => messageCount.value > 99 ? "99+" : String(messageCount.value));
const messageCountLabel = computed(() => t("messaging.unreadCount", { count: messageCount.value }));

const { isLoading: isPageLoading } = useLoadingIndicator({
  throttle: 120,
  hideDelay: 100,
  resetDelay: 0,
});

onMounted(() => {
  try {
    sidebarCollapsed.value = localStorage.getItem(sidebarStorageKey) === "true";
  } catch { /* Use the expanded default when storage is unavailable. */ }
  mobileNavigationReady.value = true;
  notificationsReady.value = true;
});

const navigation = computed(() => getCrmNavigation(user.value, t));
const settings = computed(() => navigation.value.settings);
const groups = computed(() => navigation.value.groups);
const desktopGroups = computed(() => {
  const home = groups.value.flatMap((group) => group.items).find((item) => item.to === "/");
  if (!home) return groups.value;
  const sections = groups.value
    .map((group) => ({ ...group, items: group.items.filter((item) => item.to !== "/") }))
    .filter((group) => group.items.length);
  return [{ label: "", items: [home] }, ...sections];
});
const specialistWork = computed(() => navigation.value.specialistWork);
const isSpecialistNavigation = computed(() => navigation.value.isSpecialistNavigation);
const settingsMenuItems = computed(() =>
  settings.value.map((item) => ({ ...item, exact: true })),
);
const isSettingsPage = computed(() =>
  settings.value.some((item) => route.path === item.to),
);

const mobileGroups = computed(() =>
  isAdministrator.value
    ? [...groups.value, { label: t("nav.settings"), items: settings.value }]
    : groups.value,
);
const allItems = computed(() => mobileGroups.value.flatMap((group) => group.items));
const mobilePrimary = computed(() => {
  if (usesManagerOnlyNavigation(user.value)) return allItems.value;
  if (isSpecialistNavigation.value) return specialistWork.value;
  const preferred = ["/", "/calendar", "/work", "/expenses"];
  return preferred
    .map((path) => allItems.value.find((item) => item.to === path))
    .filter(Boolean) as NavItem[];
});
const mobileMore = computed(() =>
  allItems.value.filter(
    (item) => !mobilePrimary.value.some((primary) => primary.to === item.to),
  ),
);
const homeHref = computed(() =>
  usesManagerOnlyNavigation(user.value)
    ? "/calendar"
    : isSpecialistNavigation.value
      ? "/work"
      : "/",
);
const roleLabel = computed(() =>
  user.value?.roles.includes("administrator")
    ? t("roles.administrator")
    : user.value?.roles.includes("manager")
      ? t("roles.manager")
      : user.value?.roles.includes("specialist")
        ? t("roles.specialist")
        : t("roles.cleaner"),
);
function active(to: string) {
  if (to === "/work")
    return route.path === "/work" || route.path.startsWith("/cleanings/");
  return to === "/" ? route.path === "/" : route.path.startsWith(to);
}
const unreadBadge = computed(() =>
  notifications.unreadCount.value > 99
    ? "99+"
    : String(notifications.unreadCount.value),
);
async function logout() {
  if (logoutPending.value) return;
  logoutPending.value = true;
  moreOpen.value = false;
  try {
    await unregisterPushSubscription().catch(() => undefined);
    await $fetch("/api/auth/logout", { method: "POST" });
    userSession.session.value = null;
    await navigateTo("/login");
  } finally {
    logoutPending.value = false;
  }
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <div id="app-top-banner" class="app-top-banner" />
    <p v-if="!online" class="offline-banner">{{ $t("common.offline") }}</p>

    <aside class="desktop-sidebar">
      <div class="desktop-sidebar__header">
        <NuxtLink v-if="!sidebarCollapsed" :to="homeHref" class="brand-mark"
          ><CrmBrandMark /></NuxtLink
        >
        <UTooltip :text="sidebarToggleLabel" :content="sidebarTooltipContent">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-panel-left-close"
            class="desktop-sidebar__toggle"
            :class="{ 'desktop-sidebar__toggle--collapsed': sidebarCollapsed }"
            :aria-label="sidebarToggleLabel"
            :aria-expanded="!sidebarCollapsed"
            aria-controls="desktop-navigation"
            @click="toggleSidebar"
          />
        </UTooltip>
      </div>
      <nav id="desktop-navigation" class="desktop-sidebar__nav mt-8 space-y-6" :aria-label="$t('nav.work')">
        <section v-for="group in desktopGroups" :key="group.label" :aria-label="group.label || undefined">
          <p v-if="group.label && !sidebarCollapsed" class="nav-group-label">{{ group.label }}</p>
          <div :class="group.label && !sidebarCollapsed ? 'mt-2 space-y-1' : 'space-y-1'">
            <UTooltip
              v-for="item in group.items"
              :key="item.to"
              :text="item.label"
              :disabled="!sidebarCollapsed"
              :content="sidebarTooltipContent"
            >
              <NuxtLink
                :to="item.to"
                class="nav-item relative"
                :class="{ 'nav-item--active': active(item.to) }"
                :aria-label="item.to === '/messages' && messageCount ? `${item.label}, ${messageCountLabel}` : item.label"
                :aria-current="active(item.to) ? 'page' : undefined"
              >
                <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
                <span v-if="!sidebarCollapsed" class="min-w-0 truncate">{{ item.label }}</span>
                <UBadge
                  v-if="item.to === '/messages' && messageCount"
                  size="sm"
                  color="primary"
                  variant="solid"
                  class="shrink-0 tabular-nums"
                  :class="sidebarCollapsed ? 'absolute end-0 top-0' : 'ms-auto'"
                  aria-hidden="true"
                >{{ messageBadge }}</UBadge>
              </NuxtLink>
            </UTooltip>
          </div>
        </section>
      </nav>
      <div v-if="isAdministrator" class="mt-2 shrink-0">
        <UDropdownMenu
          :items="settingsMenuItems"
          :modal="false"
          :content="{ side: 'top', align: 'start', sideOffset: 6, collisionPadding: 8 }"
          :ui="{
            content: 'hidden min-w-56 rounded-[14px] lg:flex',
            item: 'min-h-11 items-center cursor-pointer aria-[current=page]:before:bg-accented',
          }"
        >
          <template #default="{ open }">
            <UTooltip :text="$t('nav.settings')" :disabled="!sidebarCollapsed || open" :content="sidebarTooltipContent">
              <button
                type="button"
                class="nav-item w-full text-start"
                :class="{ 'nav-item--active': isSettingsPage || open }"
                :aria-label="$t('nav.settings')"
              >
                <UIcon name="i-lucide-settings" class="size-5 shrink-0" aria-hidden="true" />
                <template v-if="!sidebarCollapsed">
                  <span>{{ $t("nav.settings") }}</span>
                  <UIcon :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="ms-auto size-4 shrink-0" aria-hidden="true" />
                </template>
              </button>
            </UTooltip>
          </template>
          <template #item-trailing="{ active: isCurrent }">
            <UIcon v-if="isCurrent" name="i-lucide-check" class="ms-auto size-4 shrink-0 text-primary" aria-hidden="true" />
          </template>
        </UDropdownMenu>
      </div>
      <UserMenu :collapsed="sidebarCollapsed" :name="user?.name" :role-label="roleLabel" :logout-pending="logoutPending" @logout="logout" />
    </aside>

    <div class="app-content">
      <header class="app-topbar">
        <NuxtLink :to="homeHref" class="brand-mark lg:hidden"
          ><CrmBrandMark /></NuxtLink
        >
        <div class="app-topbar__actions">
          <LanguageSwitcher />
          <div class="relative shrink-0">
            <UButton
              to="/notifications"
              class="topbar-action"
              color="neutral"
              variant="ghost"
              icon="i-lucide-bell"
              :aria-label="$t('common.notifications')"
            />
            <span
              v-if="notificationsReady && notifications.unreadCount.value"
              class="pointer-events-none absolute top-0 right-0 grid size-4 place-items-center rounded-full bg-error text-[11px] font-bold leading-none tabular-nums shadow-[0_0_0_2px_var(--color-canvas)]"
              style="color: #fff; top: 4px; right: 6px"
              >{{ unreadBadge }}</span
            >
          </div>
          <UserMenu mobile :name="user?.name" :role-label="roleLabel" :logout-pending="logoutPending" @logout="logout" />
        </div>
      </header>
      <main class="app-main" :aria-busy="isPageLoading">
        <div v-if="user?.isSuperuser" class="sticky top-0 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-100 p-3 text-amber-950 shadow-sm">
          <span>Клиент: <strong>{{ user.organizationName }}</strong><span v-if="user.organizationStatus === 'blocked'"> · Заблокирован</span></span>
          <UButton color="neutral" variant="soft" class="min-h-11 cursor-pointer" @click="switchClientContext(null)">К клиентам</UButton>
        </div>
        <slot />
        <Transition name="page-loading">
          <div
            v-if="isPageLoading"
            class="page-loading-overlay"
            role="status"
            aria-live="polite"
            :aria-label="$t('common.pageLoading')"
          >
            <div class="page-loading-indicator">
              <UIcon
                name="i-lucide-loader-circle"
                class="page-loading-indicator__icon"
                aria-hidden="true"
              />
              <span>{{ $t("common.pageLoading") }}</span>
            </div>
          </div>
        </Transition>
      </main>
    </div>

    <nav class="mobile-nav" :aria-label="$t('common.mobileNavigation')">
      <NuxtLink
        v-for="item in mobilePrimary"
        :key="item.to"
        :to="item.to"
        class="mobile-nav__item"
        :class="{
          'mobile-nav__item--active': active(item.to),
          'mobile-nav__item--ready': mobileNavigationReady,
        }"
      >
        <UIcon :name="item.icon" class="mobile-nav__icon size-5" /><span>{{
          item.label
        }}</span>
      </NuxtLink>
      <button
        v-if="!usesManagerOnlyNavigation(user) && !isSpecialistNavigation && (mobileMore.length || user)"
        type="button"
        class="mobile-nav__item"
        :class="{
          'mobile-nav__item--active': mobileMore.some((item) =>
            active(item.to),
          ),
          'mobile-nav__item--ready': mobileNavigationReady,
        }"
        @click="moreOpen = true"
      >
        <UIcon name="i-lucide-menu" class="mobile-nav__icon size-5" /><span>{{
          $t("common.more")
        }}</span>
      </button>
    </nav>

    <PasskeySettings :show-trigger="false" :suppress-offer="releaseAnnouncements.open.value" />
    <ReleaseAnnouncement :home-href="homeHref" :blocked="moreOpen" />
    <UDrawer v-model:open="moreOpen" :title="$t('common.menu')">
      <template #body>
        <nav v-if="mobileGroups.length" class="grid gap-6">
          <section v-for="group in mobileGroups" :key="group.label">
            <p v-if="group.label" class="nav-group-label">{{ group.label }}</p>
            <div :class="group.label ? 'mt-2 grid gap-2' : 'grid gap-2'">
              <NuxtLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="drawer-nav-item"
                :aria-label="item.to === '/messages' && messageCount ? `${item.label}, ${messageCountLabel}` : undefined"
                @click="moreOpen = false"
              >
                <UIcon :name="item.icon" class="size-5 shrink-0" aria-hidden="true" />
                <span>{{ item.label }}</span>
                <UBadge
                  v-if="item.to === '/messages' && messageCount"
                  size="sm"
                  color="primary"
                  variant="solid"
                  class="ms-auto shrink-0 tabular-nums"
                  aria-hidden="true"
                >{{ messageBadge }}</UBadge>
              </NuxtLink>
            </div>
          </section>
        </nav>
      </template>
    </UDrawer>
  </div>
</template>
