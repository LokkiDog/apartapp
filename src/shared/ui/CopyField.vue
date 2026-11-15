<script setup lang="ts">
defineProps<{ value?: string; copyLabel: string; copied?: boolean }>()
defineEmits<{ copy: [] }>()
</script>

<template>
  <UFieldGroup class="w-full">
    <UInput :model-value="value" readonly dir="ltr" class="min-w-0 flex-1" />
    <UButton
      type="button"
      :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      color="neutral"
      variant="outline"
      square
      class="min-h-11 min-w-11 shrink-0 justify-center"
      :aria-label="copyLabel"
      :title="copyLabel"
      :disabled="!value"
      @click="$emit('copy')"
    />
  </UFieldGroup>
</template>
