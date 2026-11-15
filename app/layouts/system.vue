<script setup lang="ts">
import { SystemShell } from '#fsd/app'
import { PwaInstallPrompt } from '#fsd/features/install-pwa'

const { loggedIn } = useUserSession()
</script>

<template>
  <SystemShell>
    <slot />
    <PwaInstallPrompt v-if="loggedIn" />
  </SystemShell>
</template>
