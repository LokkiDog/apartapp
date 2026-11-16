<script setup lang="ts">
import { socialLabels } from '../../../shared/contracts/public-site'
const { copy, settings, hostDescription } = useSite()
const phoneLink = computed(() => settings.value?.phone ? `tel:${settings.value.phone.replace(/[^+\d]/g, '')}` : '')
const socialLinks = computed(() => settings.value?.socials?.map(({ platform, value }) => ({
  label: platform === 'other' ? new URL(value).hostname : socialLabels[platform],
  href: platform === 'telegram' && value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value
})) ?? [])
const hostPhoto = computed(() => settings.value?.hostPhoto || '')
</script>
<template>
  <section v-if="settings" id="contacts" class="host-section" :class="{ 'host-section--portrait': hostPhoto }" aria-labelledby="host-title">
    <img v-if="hostPhoto" :src="hostPhoto" :alt="settings.hostName" loading="lazy" width="640" height="640">
    <div class="host-copy">
      <h2 id="host-title">{{ copy.about }}</h2>
      <p class="font-semibold">{{ settings.hostName }}</p>
      <p v-if="hostDescription">{{ hostDescription }}</p>
      <p v-if="copy.hostWelcome">{{ copy.hostWelcome }}</p>
      <div v-if="settings.whatsapp || phoneLink || socialLinks.length" class="host-contact-links">
        <SiteContact v-if="settings.whatsapp" :label="copy.whatsapp" />
        <a v-if="phoneLink" :href="phoneLink" dir="ltr" class="button">{{ settings.phone }}</a>
        <a v-for="link in socialLinks" :key="link.href" :href="link.href" class="button" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
      </div>
    </div>
  </section>
</template>
