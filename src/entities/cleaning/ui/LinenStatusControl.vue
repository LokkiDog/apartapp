<script setup lang="ts">
const props = withDefaults(defineProps<{
  startedAt?: string | null
  collected: boolean
  editable?: boolean
}>(), { startedAt: null, editable: false })

const { t } = useI18n()
const emit = defineEmits<{ toggle: [collected: boolean] }>()
</script>

<template>
  <UButton
    v-if="editable"
    type="button"
    color="primary"
    variant="soft"
    size="xs"
    class="linen-status-button h-6 min-h-6 px-2"
    :title="t('linenAction.collected')"
    @click.stop="emit('toggle', !collected)"
  >{{ t('linenAction.collected') }}</UButton>
  <UIcon
    v-else-if="startedAt || collected"
    name="i-lucide-bed"
    class="size-5 shrink-0"
    :class="collected ? 'text-success' : 'text-error'"
    :aria-label="collected ? t('work.linenCollected') : t('work.linenPending')"
  />
</template>
