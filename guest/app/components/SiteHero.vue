<script setup lang="ts">
const { copy, branding } = useSite()
</script>
<template>
  <section class="hero" :class="{ 'hero--client': branding }" aria-labelledby="hero-title">
    <img v-if="!branding" src="/images/bansko-panorama-reference.webp" :alt="copy.heroAlt" width="2172" height="724" fetchpriority="high">
    <div class="hero-copy">
      <h1 id="hero-title">{{ copy.headline }}</h1>
      <p v-if="copy.intro">{{ copy.intro }}</p>
    </div>
  </section>
</template>
