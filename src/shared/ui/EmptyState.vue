<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon"><UIcon :name="icon ?? 'i-lucide-inbox'" class="size-6" /></div>
    <h3 class="mt-4 font-semibold">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-sm text-pretty text-sm text-[var(--color-muted)]">{{ description }}</p>
    <div v-if="$slots.actions" class="mt-4"><slot name="actions" /></div>
  </div>
</template>
