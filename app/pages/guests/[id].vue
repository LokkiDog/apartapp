<script setup lang="ts">
import { GuestPage } from '#fsd/pages/guests'
definePageMeta({ middleware: ['auth', 'guests-access'] })
</script>

<template><GuestPage /></template>
