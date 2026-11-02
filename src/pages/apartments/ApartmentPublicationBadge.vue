<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ compact?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-muted)]" :title="t('publication.live')">
    <UIcon name="i-lucide-globe" class="size-3.5" aria-hidden="true" />
    <span :class="compact ? 'sr-only' : undefined">{{ t('publication.live') }}</span>
  </span>
</template>
