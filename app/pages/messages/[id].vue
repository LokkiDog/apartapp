<script setup lang="ts">
import { MessagesPage } from '#fsd/pages/messaging'
definePageMeta({ middleware: ['auth', 'messaging-access'] })
</script>
<template><MessagesPage /></template>
