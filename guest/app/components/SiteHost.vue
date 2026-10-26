<script setup lang="ts">
const { copy, config } = useSite()
const hostPhoto = computed(() => /^\/(?!\/)/.test(String(config.public.hostPhoto)) ? config.public.hostPhoto : '')
</script>
<template>
  <section id="contacts" class="host-section" :class="{ 'host-section--portrait': hostPhoto }" aria-labelledby="host-title">
    <img v-if="hostPhoto" :src="hostPhoto" :alt="config.public.hostName" loading="lazy" width="600" height="450">
    <div><h2 id="host-title">{{ copy.about }}</h2><p>{{ copy.hello }} {{ config.public.hostName }}. {{ config.public.hostDescription }}</p><SiteContact :label="copy.whatsapp" /></div>
  </section>
</template>
