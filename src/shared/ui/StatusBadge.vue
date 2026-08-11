<script setup lang="ts">
withDefaults(defineProps<{ label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>(), { tone: 'neutral' })
</script>

<template><span class="status-badge" :data-tone="tone"><span class="status-badge__dot" />{{ label }}</span></template>
