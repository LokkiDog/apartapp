<script setup lang="ts">
import { MessagingSettingsPage } from '#fsd/pages/messaging'
definePageMeta({ middleware: ['auth', 'messaging-access'] })
</script>
<template><MessagingSettingsPage /></template>
