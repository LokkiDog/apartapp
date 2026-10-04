<script setup lang="ts">
import { ClientsPage } from '#fsd/pages/system'
definePageMeta({ middleware: 'auth', layout: 'system' })
</script>
<template><ClientsPage /></template>
