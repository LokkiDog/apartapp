<script setup lang="ts">
import { PwaInstallPrompt } from '#fsd/features/install-pwa'

const i18nHead = useLocaleHead({ dir: true, lang: true, seo: false })
useHead(() => ({ htmlAttrs: i18nHead.value.htmlAttrs }))
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout><NuxtPage /></NuxtLayout>
  <PwaInstallPrompt />
</template>
