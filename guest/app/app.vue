<script setup lang="ts">
import type { PublicSite } from '../shared/public-site'
import { guestLocales, localizedGuestPath } from '#shared/locale'
await useFetch<PublicSite>('/api/catalogue/site', { key: 'public-site' })
const { copy, url, localePath } = useSite()
useSeoMeta({ title: () => copy.value.siteTitle, description: () => copy.value.intro, ogTitle: 'Aparts Bansko', ogDescription: () => copy.value.intro, ogImage: url('/images/bansko-panorama-reference.webp'), twitterCard: 'summary_large_image' })
const route = useRoute()
useHead(() => ({ link: [
  ...guestLocales.map(language => ({ rel: 'alternate' as const, hreflang: language, href: url(localizedGuestPath(route.path, language)) })),
  { rel: 'alternate', hreflang: 'x-default', href: url(localizedGuestPath(route.path, 'ru')) },
] }))
</script>
<template>
  <a href="#main" class="skip-link">{{ copy.skip }}</a>
  <div class="site-shell"><SiteHeader /><NuxtPage /><div class="site-bottom"><footer class="site-footer"><NuxtLink :to="localePath('/')" class="brand">APARTS BANSKO</NuxtLink><NuxtLink :to="localePath('/privacy')">{{ copy.privacy }}</NuxtLink></footer></div></div>
  <ApartmentEnquiryDialog />
</template>
