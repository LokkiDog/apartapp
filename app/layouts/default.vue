<script setup lang="ts">
import { AppShell } from '#fsd/app'
import { PwaInstallPrompt } from '#fsd/features/install-pwa'

const { loggedIn } = useUserSession()
</script>

<template>
  <AppShell>
    <slot />
    <PwaInstallPrompt v-if="loggedIn" />
  </AppShell>
</template>
