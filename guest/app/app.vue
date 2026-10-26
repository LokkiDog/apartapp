<script setup lang="ts">
const { copy, config } = useSite()
useSeoMeta({ title: 'Aparts Bansko — апартаменты в Банско', description: copy.intro, ogTitle: 'Aparts Bansko', ogDescription: copy.intro, ogImage: `${config.public.siteUrl}/bansko-hero.jpg`, twitterCard: 'summary_large_image' })
</script>
<template>
  <a href="#main" class="skip-link">{{ copy.skip }}</a>
  <div class="site-shell"><SiteHeader /><NuxtPage /><footer class="site-footer"><NuxtLink to="/" class="brand">APARTS BANSKO</NuxtLink><NuxtLink to="/privacy">{{ copy.privacy }}</NuxtLink><span>{{ copy.place }}</span></footer></div>
</template>
