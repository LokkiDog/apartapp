<script setup lang="ts">
import {
  canAccessWorkSection,
  useCurrentUser,
  usesManagerOnlyNavigation,
} from "#fsd/shared/auth";
import { useNetworkStatus } from "#fsd/shared/lib";
import { useNotificationState } from "#fsd/features/manage-notifications";
import { unregisterPushSubscription } from "#fsd/features/manage-push-subscription";
import LanguageSwitcher from "./LanguageSwitcher.vue";
const { t } = useI18n();

type NavItem = { to: string; label: string; icon: string };
const route = useRoute();
const user = useCurrentUser();
const online = useNetworkStatus();
const notifications = useNotificationState();
const moreOpen = ref(false);
const mobileNavigationReady = ref(false);
const { isLoading: isPageLoading } = useLoadingIndicator({
  throttle: 120,
  hideDelay: 100,
  resetDelay: 0,
});

onMounted(() => {
  mobileNavigationReady.value = true;
});

const work = computed<NavItem[]>(() => [
  { to: "/", label: t("nav.home"), icon: "i-lucide-layout-dashboard" },
  { to: "/calendar", label: t("nav.bookings"), icon: "i-lucide-calendar-days" },
  { to: "/work", label: t("nav.cleanings"), icon: "i-lucide-sparkles" },
]);
const expenses = computed<NavItem>(() => ({
  to: "/expenses",
  label: t("nav.expenses"),
  icon: "i-lucide-receipt-euro",
}));
const objects = computed<NavItem[]>(() => [
  {
    to: "/apartments",
    label: t("nav.apartments"),
    icon: "i-lucide-building-2",
  },
  { to: "/hotels", label: t("nav.hotels"), icon: "i-lucide-hotel" },
  { to: "/inventory", label: t("nav.inventory"), icon: "i-lucide-package" },
]);
const reports = computed<NavItem[]>(() => [
  {
    to: "/reports",
    label: t("nav.summary"),
    icon: "i-lucide-chart-no-axes-combined",
  },
  {
    to: "/statement",
    label: t("nav.statement"),
    icon: "i-lucide-wallet-cards",
  },
]);
const managerFinance = computed<NavItem[]>(() => [
  {
    to: "/statement",
    label: t("nav.myExpenses"),
    icon: "i-lucide-wallet-cards",
  },
]);
const managerPrimary = computed<NavItem[]>(() => [
  { to: "/calendar", label: t("nav.bookings"), icon: "i-lucide-calendar-days" },
  {
    to: "/apartments",
    label: t("nav.apartments"),
    icon: "i-lucide-building-2",
  },
  ...managerFinance.value,
]);
const settings = computed<NavItem[]>(() => [
  { to: "/settings/users", label: t("nav.users"), icon: "i-lucide-users" },
  {
    to: "/settings/apartment-types",
    label: t("nav.apartmentTypes"),
    icon: "i-lucide-badge-euro",
  },
  {
    to: "/settings/services",
    label: t("nav.services"),
    icon: "i-lucide-concierge-bell",
  },
]);

const groups = computed(() => {
  if (user.value?.roles.includes("administrator"))
    return [
      { label: t("nav.work"), items: [...work.value, expenses.value] },
      { label: t("nav.objects"), items: objects.value },
      { label: t("nav.reports"), items: reports.value },
      { label: t("nav.settings"), items: settings.value },
    ];
  if (usesManagerOnlyNavigation(user.value))
    return [{ label: "", items: managerPrimary.value }];
  if (user.value?.roles.includes("manager"))
    return [
      {
        label: t("nav.work"),
        items: work.value.filter(
          (item) => item.to !== "/work" || canAccessWorkSection(user.value),
        ),
      },
      {
        label: t("nav.objects"),
        items: objects.value.filter(
          (item) => !["/hotels", "/inventory"].includes(item.to),
        ),
      },
      { label: t("nav.finance"), items: managerFinance.value },
    ];
  return [
    {
      label: t("nav.work"),
      items: work.value.filter((item) => ["/", "/work"].includes(item.to)),
    },
  ];
});
const allItems = computed(() => groups.value.flatMap((group) => group.items));
const mobilePrimary = computed(() => {
  if (usesManagerOnlyNavigation(user.value)) return allItems.value;
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
  usesManagerOnlyNavigation(user.value) ? "/calendar" : "/",
);
const roleLabel = computed(() =>
  user.value?.roles.includes("administrator")
    ? t("roles.administrator")
    : user.value?.roles.includes("manager")
      ? t("roles.manager")
      : t("roles.cleaner"),
);
function active(to: string) {
  return to === "/" ? route.path === "/" : route.path.startsWith(to);
}
const unreadBadge = computed(() =>
  notifications.unreadCount.value > 99
    ? "99+"
    : String(notifications.unreadCount.value),
);
async function logout() {
  moreOpen.value = false;
  await unregisterPushSubscription();
  await $fetch("/api/auth/logout", { method: "POST" });
  await navigateTo("/login");
}
</script>

<template>
  <div class="app-shell">
    <p v-if="!online" class="offline-banner">{{ $t("common.offline") }}</p>

    <aside class="desktop-sidebar">
      <NuxtLink :to="homeHref" class="brand-mark"
        >aparts<span>.</span></NuxtLink
      >
      <nav class="mt-8 flex-1 space-y-6" :aria-label="$t('nav.work')">
        <section v-for="group in groups" :key="group.label">
          <p v-if="group.label" class="nav-group-label">{{ group.label }}</p>
          <div :class="group.label ? 'mt-2 space-y-1' : 'space-y-1'">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-item"
              :class="{ 'nav-item--active': active(item.to) }"
            >
              <UIcon :name="item.icon" class="size-5" /><span>{{
                item.label
              }}</span>
            </NuxtLink>
          </div>
        </section>
      </nav>
      <div class="sidebar-profile">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ user?.name }}</p>
          <p class="text-xs text-[var(--color-muted)]">{{ roleLabel }}</p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-log-out"
          :aria-label="$t('common.logout')"
          @click="logout"
        />
      </div>
    </aside>

    <div class="app-content">
      <header class="app-topbar">
        <NuxtLink :to="homeHref" class="brand-mark lg:hidden"
          >aparts<span>.</span></NuxtLink
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
              v-if="notifications.unreadCount.value"
              class="pointer-events-none absolute top-0 right-0 grid size-4 place-items-center rounded-full bg-error text-[11px] font-bold leading-none tabular-nums shadow-[0_0_0_2px_var(--color-canvas)]"
              style="color: #fff; top: 4px; right: 6px"
              >{{ unreadBadge }}</span
            >
          </div>
        </div>
      </header>
      <main class="app-main" :aria-busy="isPageLoading">
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
        v-if="mobileMore.length || user"
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

    <UDrawer v-model:open="moreOpen" :title="$t('common.menu')">
      <template #body>
        <nav v-if="groups.length" class="grid gap-6">
          <section v-for="group in groups" :key="group.label">
            <p v-if="group.label" class="nav-group-label">{{ group.label }}</p>
            <div :class="group.label ? 'mt-2 grid gap-2' : 'grid gap-2'">
              <NuxtLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="drawer-nav-item"
                @click="moreOpen = false"
                ><UIcon :name="item.icon" class="size-5" />{{
                  item.label
                }}</NuxtLink
              >
            </div>
          </section>
        </nav>
        <div class="drawer-nav-footer">
          <button
            type="button"
            class="drawer-nav-item drawer-nav-item--logout"
            @click="logout"
          >
            <UIcon name="i-lucide-log-out" class="size-5" />{{
              $t("common.logout")
            }}
          </button>
        </div>
      </template>
    </UDrawer>
  </div>
</template>
