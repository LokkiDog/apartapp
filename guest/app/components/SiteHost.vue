<script setup lang="ts">
const { copy, settings, hostDescription } = useSite()
const hostPhoto = computed(() => settings.value?.hostPhoto || '')
</script>
<template>
  <section v-if="settings" id="contacts" class="host-section" :class="{ 'host-section--portrait': hostPhoto }" aria-labelledby="host-title">
    <img v-if="hostPhoto" :src="hostPhoto" :alt="settings.hostName" loading="lazy" width="640" height="640">
    <div class="host-copy">
      <h2 id="host-title">{{ copy.about }}</h2>
      <p class="font-semibold">{{ settings.hostName }}</p>
      <p>{{ hostDescription }}</p>
      <p>{{ copy.hostWelcome }}</p>
      <SiteContact :label="copy.whatsapp" />
    </div>
  </section>
</template>
