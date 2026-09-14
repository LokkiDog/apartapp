<script setup lang="ts">
import { PwaInstallPrompt } from '#fsd/features/install-pwa'

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
  <UApp :toaster="toasterDefaults">
    <UTheme :props="overlayDefaults">
      <VitePwaManifest />
      <NuxtLayout><NuxtPage /></NuxtLayout>
      <PwaInstallPrompt />
    </UTheme>
  </UApp>
</template>
