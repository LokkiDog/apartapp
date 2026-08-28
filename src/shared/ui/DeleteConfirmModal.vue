<script setup lang="ts">
defineProps<{ title: string; description: string; loading?: boolean; error?: string }>()
const { t } = useI18n()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-5">
        <UAlert color="error" variant="soft" :title="t('common.irreversible')" :description="description" />
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
        <div class="form-actions"><UButton color="neutral" variant="ghost" @click="open = false">{{ t('common.cancel') }}</UButton><UButton color="error" :loading="loading" @click="emit('confirm')">{{ t('common.deleteForever') }}</UButton></div>
      </div>
    </template>
  </UModal>
</template>
