<script setup lang="ts">
defineProps<{ title: string; description: string; confirmLabel: string; loading?: boolean; error?: string }>()
const { t } = useI18n()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-5">
        <p class="text-sm leading-6 text-[var(--color-muted)]">{{ description }}</p>
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
        <div class="form-actions">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('common.cancel') }}</UButton>
          <UButton icon="i-lucide-circle-check" :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
