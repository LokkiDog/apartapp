<script setup lang="ts">
const { copy } = useSite()
const open = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
</script>
<template>
  <header class="site-header">
    <NuxtLink to="/" class="brand" :aria-label="copy.brand"><svg viewBox="0 0 80 34" aria-hidden="true"><path d="M2 30 28 9 36 17 49 2 78 30M18 25 29 15 35 22M37 23 50 9 58 19" /></svg><span>APARTS BANSKO</span></NuxtLink>
    <nav class="desktop-nav" :aria-label="copy.menu"><NuxtLink to="/#apartments">{{ copy.apartments }}</NuxtLink><NuxtLink to="/#contacts">{{ copy.contacts }}</NuxtLink></nav>
    <div class="desktop-contact"><SiteContact /></div>
    <button class="menu-toggle" :aria-label="open ? copy.close : copy.menu" :aria-expanded="open" aria-controls="mobile-navigation" @click="open = !open">{{ open ? '×' : '☰' }}</button>
    <nav v-if="open" id="mobile-navigation" class="mobile-nav" :aria-label="copy.menu" @keydown.esc="open = false"><NuxtLink to="/#apartments">{{ copy.apartments }}</NuxtLink><NuxtLink to="/#contacts">{{ copy.contacts }}</NuxtLink></nav>
  </header>
</template>
