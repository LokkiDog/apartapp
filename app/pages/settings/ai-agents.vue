<script setup lang="ts">
definePageMeta({
  middleware: ['auth', () => navigateTo({ path: '/profile', hash: '#ai-agents' })]
})
</script>

<template><div /></template>
