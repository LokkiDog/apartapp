<script setup lang="ts">
import type { PublicApartment } from '../../shared/catalogue'
const { copy, config } = useSite()
const { data: apartments, status, error, refresh } = await useFetch<PublicApartment[]>('/api/catalogue/apartments', { default: () => [] })
useHead({ link: [{ rel: 'canonical', href: config.public.siteUrl }] })
</script>
<template>
  <main id="main">
    <section class="hero" aria-labelledby="hero-title"><img src="/bansko-hero.jpg" alt="Горы Пирин и Банско" width="1920" height="1080" fetchpriority="high"><h1 id="hero-title">{{ copy.headline }}</h1></section>
    <div class="hero-caption"><p>{{ copy.intro }}</p><a href="#apartments" class="text-link">{{ copy.choose }} <span aria-hidden="true">↗</span></a></div>
    <section id="apartments" class="catalogue" aria-labelledby="catalogue-title">
      <h2 id="catalogue-title" class="section-title">{{ copy.apartments }}</h2>
      <div v-if="status === 'pending'" class="apartment-grid" aria-busy="true"><div v-for="n in 2" :key="n" class="photo-skeleton" /></div>
      <div v-else-if="error" class="catalogue-state" role="alert"><p>{{ copy.error }}</p><button class="button" @click="refresh()">{{ copy.retry }}</button></div>
      <div v-else-if="!apartments.length" class="catalogue-state"><p>{{ copy.empty }}</p><p>{{ copy.emptyHint }}</p></div>
      <div v-else class="apartment-grid"><article v-for="(apartment, index) in apartments" :key="apartment.slug" class="apartment-item"><NuxtLink :to="`/apartments/${apartment.slug}`" class="apartment-photo"><img :src="apartment.photos[0]?.url" :alt="apartment.title" width="960" height="640" :loading="index < 2 ? 'eager' : 'lazy'"></NuxtLink><div class="apartment-caption"><div><h3><NuxtLink :to="`/apartments/${apartment.slug}`">{{ apartment.title }}</NuxtLink></h3><p>{{ copy.guests }} {{ apartment.capacity }} · {{ copy.rooms }} {{ apartment.rooms }}</p></div><NuxtLink :to="`/apartments/${apartment.slug}`" class="text-link" :aria-label="`${copy.view}: ${apartment.title}`">{{ copy.view }} ↗</NuxtLink></div></article></div>
    </section>
    <SiteHost />
  </main>
</template>
