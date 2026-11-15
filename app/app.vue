<script setup lang="ts">
import { en, he, ru } from '@nuxt/ui/locale'

const { locale } = useI18n()
const uiLocales = { en, he, ru }
const uiLocale = computed(() => uiLocales[locale.value as keyof typeof uiLocales] ?? ru)
const i18nHead = useLocaleHead({ dir: true, lang: true, seo: false })
const overlayDefaults = {
  dropdownMenu: { modal: false },
  select: { content: { bodyLock: false } },
  selectMenu: { content: { bodyLock: false } }
} as const
const toasterDefaults = {
  position: 'top-center',
  progress: false,
  portal: 'body',
  ui: { viewport: 'app-toast-viewport' }
} as const

useHead(() => ({ htmlAttrs: i18nHead.value.htmlAttrs }))
</script>

<template>
  <UApp :locale="uiLocale" :toaster="toasterDefaults">
    <UTheme :props="overlayDefaults">
      <VitePwaManifest />
      <NuxtLayout><NuxtPage /></NuxtLayout>
    </UTheme>
  </UApp>
</template>
