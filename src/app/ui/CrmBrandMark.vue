<script setup lang="ts">
const { public: { brand } } = useRuntimeConfig()
</script>

<template>
  <img v-if="brand.logo" :src="brand.logo" :alt="brand.shortName" class="block h-auto" width="122" height="34" />
  <template v-else>aparts<span>.</span></template>
</template>

<style scoped>
img {
  outline: none;
}
</style>
