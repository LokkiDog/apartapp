<script setup lang="ts">
const { copy, pageUrl, localePath } = useSite()
useSeoMeta({ title: () => `${copy.value.privacy} — Aparts Bansko` })
useHead(() => ({ link: [{ rel: 'canonical', href: pageUrl('/privacy') }] }))
</script>
<template><main id="main" class="legal"><h1>{{ copy.privacy }}</h1><p>{{ copy.privacyBrowsing }}</p><p>{{ copy.privacyTechnical }}</p><p>{{ copy.privacyMap }}</p><p>{{ copy.privacyWhatsApp }}</p><p>{{ copy.privacyPreferences }}</p><NuxtLink :to="localePath('/')">{{ copy.home }}</NuxtLink></main></template>
