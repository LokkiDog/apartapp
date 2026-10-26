<script setup lang="ts">
defineProps<{ error: { statusCode?: number } }>()
const { copy } = useSite()
</script>
<template><div class="site-shell"><SiteHeader /><main id="main" class="error-page"><h1>{{ error.statusCode === 404 ? copy.notFound : copy.unavailable }}</h1><button class="button" @click="clearError({ redirect: '/' })">{{ copy.home }}</button></main></div></template>
