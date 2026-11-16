<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()
const { copy, settings, localePath } = useSite()
useSeoMeta({ title: () => `${props.error.statusCode === 404 ? copy.value.notFound : copy.value.unavailable}`, robots: 'noindex, nofollow' })
</script>
<template><div class="site-shell"><SiteHeader v-if="settings" /><main id="main" class="error-page"><h1>{{ error.statusCode === 404 ? copy.notFound : copy.unavailable }}</h1><button class="button" @click="clearError({ redirect: localePath('/') })">{{ copy.home }}</button></main></div></template>
