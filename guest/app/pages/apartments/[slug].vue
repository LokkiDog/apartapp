<script setup lang="ts">
import type { PublicApartment } from '../../../shared/catalogue'
const route = useRoute()
const { copy, url, pageUrl, locale, localePath, isRtl } = useSite()
const slug = computed(() => String(route.params.slug))
const { data: apartment, error, status, refresh } = await useFetch<PublicApartment>(() => `/api/catalogue/apartments/${encodeURIComponent(slug.value)}`, { query: computed(() => ({ locale: locale.value })) })
if (error.value || !apartment.value) throw createError({ statusCode: error.value?.statusCode === 404 ? 404 : 503, statusMessage: error.value?.statusCode === 404 ? copy.value.notFound : copy.value.unavailable })
useSeoMeta({ title: () => apartment.value?.title ? `${apartment.value.title} — Aparts Bansko` : copy.value.siteTitle, description: () => apartment.value?.summary, ogTitle: () => apartment.value?.title, ogDescription: () => apartment.value?.summary, ogImage: () => url(apartment.value?.photos[0]?.url ?? '/') })
const { current: contactApartment, open: enquiryOpen } = useApartmentEnquiry()
watch(apartment, value => { contactApartment.value = value ? { title: value.title, slug: value.slug } : null }, { immediate: true })
onBeforeUnmount(() => { enquiryOpen.value = false })
useHead(() => ({ link: [{ rel: 'canonical', href: pageUrl(`/apartments/${encodeURIComponent(slug.value)}`) }] }))
</script>
<template>
  <main v-if="status === 'pending'" id="main" class="detail" aria-busy="true"><div class="photo-skeleton" /></main>
  <main v-else-if="error" id="main" class="detail catalogue-state" role="alert"><p>{{ copy.error }}</p><button class="button" @click="refresh()">{{ copy.retry }}</button></main>
  <main v-else-if="apartment" id="main" class="detail">
    <NuxtLink :to="localePath('/apartments')" class="text-link back-link">{{ isRtl ? '→' : '←' }} {{ copy.back }}</NuxtLink>
    <header class="detail-header"><div><h1>{{ apartment.title }}</h1><p>{{ apartment.summary }}</p></div><SiteContact :title="apartment.title" :slug="apartment.slug" /></header>
    <ApartmentGallery :photos="apartment.photos" :title="apartment.title" />
    <div class="detail-columns"><div><p class="facts">{{ copy.guests }} {{ apartment.capacity }} · {{ copy.rooms }} {{ apartment.rooms }}</p><p class="prose">{{ apartment.description }}</p><section v-if="apartment.amenities.length" class="detail-section"><h2>{{ copy.amenities }}</h2><ul class="amenities"><li v-for="code in apartment.amenities" :key="code"><AmenityIcon :code="code" /><span>{{ copy.amenity[code] || code }}</span></li></ul></section></div><aside class="enquiry"><p>{{ copy.checkIn }} <bdi>{{ apartment.checkInTime }}</bdi><br>{{ copy.checkOut }} <bdi>{{ apartment.checkOutTime }}</bdi></p><p>{{ copy.price }}</p><SiteContact :title="apartment.title" :slug="apartment.slug" /></aside></div>
    <ApartmentLocation :apartment="apartment" />
    <SiteHost />
  </main>
</template>
