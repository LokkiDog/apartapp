<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  files?: File[]
  accept?: string
  multiple?: boolean
  disabled?: boolean
}>(), {
  files: () => [],
  accept: 'image/*',
  multiple: true,
  disabled: false
})

const emit = defineEmits<{ select: [files: File[]] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const fileLabel = computed(() => props.files.length ? props.files.map(file => file.name).join(', ') : t('common.noFileSelected'))

function openPicker() {
  if (!props.disabled) input.value?.click()
}

function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  if (files.length) emit('select', files)
  target.value = ''
}
</script>

<template>
  <div class="photo-file-input" :class="{ 'photo-file-input--disabled': disabled }">
    <input ref="input" class="sr-only" type="file" :accept="accept" :multiple="multiple" :disabled="disabled" tabindex="-1" aria-hidden="true" @change="selectFiles">
    <button type="button" class="photo-file-input__button" :disabled="disabled" @click="openPicker">
      {{ t('common.chooseFiles') }}
    </button>
    <span class="photo-file-input__status" :title="fileLabel">{{ fileLabel }}</span>
  </div>
</template>
