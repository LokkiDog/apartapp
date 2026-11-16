<script setup lang="ts">
import type { PublicApartment } from '../../shared/catalogue'
const { copy, pageUrl, locale, localePath, branding, url } = useSite()
const { data: apartments, status, error, refresh } = await useFetch<PublicApartment[]>('/api/catalogue/apartments', { query: computed(() => ({ locale: locale.value })), default: () => [] })
const featured = computed(() => apartments.value.slice(0, 3))
useSeoMeta({
  ogImage: () => {
    const cover = featured.value[0]?.photos[0]
    if (!branding.value) return url('/images/bansko-panorama-reference.webp')
    return cover ? url(cover.url) : undefined
  }
})
useHead(() => ({ link: [{ rel: 'canonical', href: pageUrl() }] }))
</script>
<template>
  <main id="main">
    <SiteHero />
    <section id="apartments" class="home-apartments" aria-labelledby="apartments-title">
      <div class="home-apartments-heading">
        <h2 id="apartments-title">{{ copy.apartments }}</h2>
        <p v-if="copy.catalogueIntro">{{ copy.catalogueIntro }}</p>
      </div>
      <div v-if="status === 'pending'" class="home-apartments-grid" aria-busy="true"><div v-for="n in 3" :key="n" class="photo-skeleton" /></div>
      <div v-else-if="error" class="catalogue-state" role="alert"><p>{{ copy.error }}</p><button class="button" @click="refresh()">{{ copy.retry }}</button></div>
      <div v-else-if="!featured.length" class="catalogue-state"><p>{{ copy.empty }}</p><p>{{ copy.emptyHint }}</p></div>
      <div v-else class="home-apartments-grid">
        <ApartmentCard v-for="apartment in featured" :key="apartment.slug" :apartment="apartment" />
      </div>
      <NuxtLink :to="localePath('/apartments')" class="button home-apartments-link">{{ copy.back }}</NuxtLink>
    </section>
    <SiteHost />
  </main>
</template>
