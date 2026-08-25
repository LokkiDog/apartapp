<script setup lang="ts">
import { PwaInstallPrompt } from '#fsd/features/install-pwa'
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout><NuxtPage /></NuxtLayout>
  <PwaInstallPrompt />
</template>
