<script setup lang="ts">
import { formatEuroInput, parseEuroInput } from '#fsd/shared/lib'

const props = withDefaults(defineProps<{
  modelValue: number | null
  placeholder?: string
  disabled?: boolean
  required?: boolean
}>(), { placeholder: '0', disabled: false, required: false })

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const raw = ref(formatEuroInput(props.modelValue))
const invalid = ref(false)

watch(() => props.modelValue, value => {
  const parsed = parseEuroInput(raw.value)
  if (parsed !== value) raw.value = formatEuroInput(value)
})

function update(value: string | number) {
  const next = String(value)
  if (!/^\d*(?:[.,]\d*)?$/.test(next)) {
    invalid.value = true
    return
  }
  invalid.value = false
  raw.value = next
  emit('update:modelValue', parseEuroInput(next))
}

function blur() {
  const parsed = parseEuroInput(raw.value)
  invalid.value = Boolean(raw.value.trim()) && parsed === null
  raw.value = formatEuroInput(parsed)
  emit('update:modelValue', parsed)
}
</script>

<template>
  <UInput
    :model-value="raw"
    inputmode="decimal"
    autocomplete="off"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :aria-invalid="invalid"
    class="w-full tabular-nums"
    @update:model-value="update"
    @blur="blur"
  >
    <template #trailing><span class="text-sm font-medium text-[var(--color-muted)]">€</span></template>
  </UInput>
</template>
