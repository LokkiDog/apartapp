<script setup lang="ts">
defineProps<{ label: string; value: string | number; icon?: string; tone?: 'neutral' | 'primary' | 'warning' | 'danger' }>()
</script>

<template>
  <div class="metric-tile" :data-tone="tone ?? 'neutral'">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-[var(--color-muted)]">{{ label }}</p>
      <UIcon v-if="icon" :name="icon" class="size-5 text-[var(--color-primary)]" />
    </div>
    <p class="mt-3 text-2xl font-semibold tracking-[-0.035em] tabular-nums">{{ value }}</p>
  </div>
</template>
