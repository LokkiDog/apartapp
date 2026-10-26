<script setup lang="ts">
import { ProfilePage } from '#fsd/pages/account'
definePageMeta({ middleware: 'auth' })
</script>

<template><ProfilePage /></template>
