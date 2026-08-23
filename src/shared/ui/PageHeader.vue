<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="page-header">
    <div class="min-w-0">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-2xl text-pretty text-sm text-[var(--color-muted)]">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
  </header>
</template>
