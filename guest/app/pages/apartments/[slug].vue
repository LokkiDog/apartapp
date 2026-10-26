<script setup lang="ts">
import type { PublicApartment } from '../../../shared/catalogue'
const route = useRoute()
const { copy, config } = useSite()
const slug = computed(() => String(route.params.slug))
const { data: apartment, error } = await useFetch<PublicApartment>(() => `/api/catalogue/apartments/${encodeURIComponent(slug.value)}`)
if (error.value || !apartment.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 503, statusMessage: error.value?.statusCode === 404 ? copy.notFound : copy.unavailable })
const activePhoto = ref(0)
watch(slug, () => { activePhoto.value = 0 })
useSeoMeta({ title: () => `${apartment.value?.title} — Aparts Bansko`, description: () => apartment.value?.summary, ogTitle: () => apartment.value?.title, ogDescription: () => apartment.value?.summary, ogImage: () => `${config.public.siteUrl}${apartment.value?.photos[0]?.url}` })
useHead({ link: [{ rel: 'canonical', href: `${config.public.siteUrl}/apartments/${slug.value}` }] })
</script>
<template>
  <main v-if="apartment" id="main" class="detail">
    <NuxtLink to="/#apartments" class="text-link back-link">← {{ copy.back }}</NuxtLink>
    <header class="detail-header"><h1>{{ apartment.title }}</h1><p>{{ apartment.summary }}</p></header>
    <section class="gallery" :aria-label="copy.gallery"><img class="gallery-main" :src="apartment.photos[activePhoto]?.url" :alt="`${apartment.title} — ${copy.photo} ${activePhoto + 1}`" width="1600" height="1000"><div v-if="apartment.photos.length > 1" class="gallery-thumbnails"><button v-for="(photo, index) in apartment.photos" :key="photo.id" :aria-label="`${copy.photo} ${index + 1}`" :aria-pressed="activePhoto === index" @click="activePhoto = index"><img :src="photo.url" alt="" width="180" height="120" loading="lazy"></button></div></section>
    <div class="detail-columns"><div><p class="facts">{{ copy.guests }} {{ apartment.capacity }} · {{ copy.rooms }} {{ apartment.rooms }}</p><p class="prose">{{ apartment.description }}</p><section v-if="apartment.amenities.length" class="detail-section"><h2>{{ copy.amenities }}</h2><ul class="amenities"><li v-for="code in apartment.amenities" :key="code">{{ copy.amenity[code] || code }}</li></ul></section><section v-if="apartment.location" class="detail-section"><h2>{{ copy.location }}</h2><p class="prose">{{ apartment.location }}</p></section></div><aside class="enquiry"><p>{{ copy.checkIn }} {{ apartment.checkInTime }}<br>{{ copy.checkOut }} {{ apartment.checkOutTime }}</p><p>{{ copy.price }}</p><SiteContact :title="apartment.title" :slug="apartment.slug" /></aside></div>
    <SiteHost />
  </main>
</template>
