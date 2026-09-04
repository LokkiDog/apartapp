<script setup lang="ts">
import { PwaInstallPrompt } from '#fsd/features/install-pwa'

const i18nHead = useLocaleHead({ dir: true, lang: true, seo: false })
const overlayDefaults = {
  dropdownMenu: { modal: false },
  select: { content: { bodyLock: false } },
  selectMenu: { content: { bodyLock: false } }
} as const

useHead(() => ({ htmlAttrs: i18nHead.value.htmlAttrs }))
</script>

<template>
  <UTheme :props="overlayDefaults">
    <VitePwaManifest />
    <NuxtLayout><NuxtPage /></NuxtLayout>
    <PwaInstallPrompt />
  </UTheme>
</template>
