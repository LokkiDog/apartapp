<script setup lang="ts">
import { SecurityPage } from '#fsd/pages/account'
definePageMeta({ middleware: 'auth' })
</script>

<template><SecurityPage /></template>
