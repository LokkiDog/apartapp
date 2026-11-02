<script setup lang="ts">
const { copy, config, hostDescription } = useSite()
const hostPhoto = computed(() => /^\/(?!\/)/.test(String(config.public.hostPhoto)) ? config.public.hostPhoto : '')
</script>
<template>
  <section id="contacts" class="host-section" :class="{ 'host-section--portrait': hostPhoto }" aria-labelledby="host-title">
    <img v-if="hostPhoto" :src="hostPhoto" :alt="config.public.hostName" loading="lazy" width="640" height="640">
    <div class="host-copy">
      <h2 id="host-title">{{ copy.about }}</h2>
      <p>{{ hostDescription }}</p>
      <p>{{ copy.hostWelcome }}</p>
      <SiteContact :label="copy.whatsapp" />
    </div>
  </section>
</template>
