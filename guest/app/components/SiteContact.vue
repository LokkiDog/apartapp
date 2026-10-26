<script setup lang="ts">
defineProps<{ title?: string, slug?: string, label?: string }>()
const { contact, copy } = useSite()
</script>
<template>
  <a v-if="contact(title, slug)" :href="contact(title, slug)" class="button" target="_blank" rel="noopener noreferrer">{{ label || copy.dates }}</a>
  <span v-else class="contact-pending">{{ copy.contactPending }}</span>
</template>
