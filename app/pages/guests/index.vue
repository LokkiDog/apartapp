<script setup lang="ts">
import { GuestsPage } from '#fsd/pages/guests'
definePageMeta({ middleware: ['auth', 'guests-access'] })
</script>

<template><GuestsPage /></template>
