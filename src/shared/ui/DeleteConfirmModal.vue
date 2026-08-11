<script setup lang="ts">
defineProps<{ title: string; description: string; loading?: boolean; error?: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-5">
        <UAlert color="error" variant="soft" title="Это действие нельзя отменить." :description="description" />
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
        <div class="form-actions"><UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton color="error" :loading="loading" @click="emit('confirm')">Удалить навсегда</UButton></div>
      </div>
    </template>
  </UModal>
</template>
