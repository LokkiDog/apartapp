<script setup lang="ts">
import { guestLanguageNames, guestLocales, type GuestLocale } from '#shared/locale'
const { copy, locale, isRtl, localePath, setLocale } = useSite()
const theme = useCookie<'light' | 'dark'>('aparts-guest-theme', {
  default: () => 'dark',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  path: '/'
})
const isLight = computed(() => theme.value === 'light')
const themeLabel = computed(() => isLight.value ? copy.value.darkTheme : copy.value.lightTheme)
useHead(() => ({ htmlAttrs: { 'data-theme': isLight.value ? 'light' : 'dark', lang: locale.value, dir: isRtl.value ? 'rtl' : 'ltr' } }))
function toggleTheme() { theme.value = isLight.value ? 'dark' : 'light' }
const selectedLanguage = computed({ get: () => locale.value, set: (value: GuestLocale) => { void setLocale(value) } })
const open = ref(false)
const toggle = useTemplateRef<HTMLButtonElement>('toggle')
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
function closeMenu() {
  if (!open.value) return
  open.value = false
  toggle.value?.focus()
}
</script>

<template>
  <header class="site-header" @keydown.esc="closeMenu">
    <NuxtLink :to="localePath('/')" class="brand" :aria-label="copy.brand">
      <svg viewBox="0 0 80 34" aria-hidden="true"><path d="M2 30 28 9 36 17 49 2 78 30M18 25 29 15 35 22M37 23 50 9 58 19" /></svg>
      <span>APARTS BANSKO</span>
    </NuxtLink>
    <nav class="desktop-nav" :aria-label="copy.menu">
      <NuxtLink :to="localePath('/apartments')">{{ copy.apartments }}</NuxtLink>
      <NuxtLink :to="localePath('/#contacts')">{{ copy.contacts }}</NuxtLink>
    </nav>
    <div class="header-actions">
      <div class="desktop-contact"><SiteContact /></div>
      <label class="language-picker" :title="guestLanguageNames[locale]">
        <span aria-hidden="true">{{ locale.toUpperCase() }}</span>
        <select v-model="selectedLanguage" :aria-label="copy.language">
          <option v-for="language in guestLocales" :key="language" :value="language">{{ guestLanguageNames[language] }}</option>
        </select>
      </label>
      <button type="button" class="theme-toggle" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
        <svg v-if="isLight" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
      </button>
    <button ref="toggle" type="button" class="menu-toggle" :aria-label="open ? copy.close : copy.menu" :aria-expanded="open" aria-controls="mobile-navigation" @click="open = !open">{{ open ? '×' : '☰' }}</button>
    </div>
    <nav v-if="open" id="mobile-navigation" class="mobile-nav" :aria-label="copy.menu">
      <NuxtLink :to="localePath('/apartments')" @click="open = false">{{ copy.apartments }}</NuxtLink>
      <NuxtLink :to="localePath('/#contacts')" @click="open = false">{{ copy.contacts }}</NuxtLink>
    </nav>
  </header>
</template>
