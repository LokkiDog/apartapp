<script setup lang="ts">
const { public: { brand } } = useRuntimeConfig()
</script>

<template>
  <img v-if="brand.logo" :src="brand.logo" :alt="brand.shortName" class="h-9 w-28 object-contain" width="112" height="36" />
  <template v-else>aparts<span>.</span></template>
</template>
