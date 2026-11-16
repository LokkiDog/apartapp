<script setup lang="ts">
import type { PublicSite } from '../shared/public-site'
import { guestLocales, localizedGuestPath } from '#shared/locale'
const { data: site, error } = await useFetch<PublicSite>('/api/catalogue/site', { key: 'public-site' })
const { copy, url, localePath, branding } = useSite()
if (error.value || !site.value) {
  const missing = error.value?.statusCode === 404
  throw createError({
    statusCode: missing ? 404 : 503,
    message: missing ? copy.value.notFound : copy.value.unavailable,
    fatal: import.meta.client
  })
}
useSeoMeta({
  title: () => copy.value.siteTitle,
  description: () => copy.value.intro || undefined,
  ogTitle: () => copy.value.brand,
  ogDescription: () => copy.value.intro || undefined,
  ogImage: () => branding.value ? undefined : url('/images/bansko-panorama-reference.webp'),
  twitterCard: () => branding.value ? 'summary' : 'summary_large_image'
})
useHead(() => ({
  htmlAttrs: { 'data-site-accent': branding.value?.accent },
  link: branding.value ? [] : [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
}))
const route = useRoute()
useHead(() => ({ link: [
  ...guestLocales.map(language => ({ rel: 'alternate' as const, hreflang: language, href: url(localizedGuestPath(route.path, language)) })),
  { rel: 'alternate', hreflang: 'x-default', href: url(localizedGuestPath(route.path, 'ru')) },
] }))
</script>
<template>
  <a href="#main" class="skip-link">{{ copy.skip }}</a>
  <div class="site-shell"><SiteHeader /><NuxtPage /><div class="site-bottom"><footer class="site-footer"><NuxtLink :to="localePath('/')" class="brand">{{ branding ? copy.brand : copy.brand.toUpperCase() }}</NuxtLink><NuxtLink :to="localePath('/privacy')">{{ copy.privacy }}</NuxtLink></footer></div></div>
  <ApartmentEnquiryDialog />
</template>
