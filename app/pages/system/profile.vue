<script setup lang="ts">
import { ProfilePage } from '#fsd/pages/account'

definePageMeta({ middleware: 'auth', layout: 'system' })
</script>

<template><ProfilePage system /></template>
