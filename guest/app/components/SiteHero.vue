<script setup lang="ts">
const { copy } = useSite()
</script>
<template>
  <section class="hero" aria-labelledby="hero-title"><img src="/images/bansko-panorama-reference.webp" :alt="copy.heroAlt" width="2172" height="724" fetchpriority="high"><div class="hero-copy"><h1 id="hero-title">{{ copy.headline }}</h1><p>{{ copy.intro }}</p></div></section>
</template>
