<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()
const { copy, localePath } = useSite()
useSeoMeta({ title: () => `${props.error.statusCode === 404 ? copy.value.notFound : copy.value.unavailable} — Aparts Bansko`, robots: 'noindex, nofollow' })
</script>
<template><div class="site-shell"><SiteHeader /><main id="main" class="error-page"><h1>{{ error.statusCode === 404 ? copy.notFound : copy.unavailable }}</h1><button class="button" @click="clearError({ redirect: localePath('/') })">{{ copy.home }}</button></main></div></template>
