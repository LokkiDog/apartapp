<script setup lang="ts">
import { formatEuroInput, parseEuroInput } from '#fsd/shared/lib'

const props = withDefaults(defineProps<{
  modelValue: number | null
  placeholder?: string
  emptyValue?: number | null
  disabled?: boolean
  required?: boolean
}>(), { placeholder: '0', emptyValue: null, disabled: false, required: false })

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const raw = ref(formatEuroInput(props.modelValue))
const invalid = ref(false)
const clearedZeroOnFocus = ref(false)

watch(() => props.modelValue, value => {
  const parsed = parseEuroInput(raw.value)
  if (parsed !== value) {
    clearedZeroOnFocus.value = false
    raw.value = formatEuroInput(value)
  }
})

function update(value: string | number) {
  const next = String(value)
  if (!/^\d*(?:[.,]\d*)?$/.test(next)) {
    invalid.value = true
    return
  }
  clearedZeroOnFocus.value = false
  invalid.value = false
  if (!next.trim() && props.emptyValue !== null) {
    raw.value = formatEuroInput(props.emptyValue)
    emit('update:modelValue', props.emptyValue)
    return
  }
  raw.value = next
  emit('update:modelValue', parseEuroInput(next))
}

function focus() {
  if (parseEuroInput(raw.value) !== 0) return
  raw.value = ''
  clearedZeroOnFocus.value = true
}

function blur() {
  const parsed = parseEuroInput(raw.value)
  const value = clearedZeroOnFocus.value && !raw.value.trim()
    ? 0
    : !raw.value.trim() && props.emptyValue !== null ? props.emptyValue : parsed
  clearedZeroOnFocus.value = false
  invalid.value = Boolean(raw.value.trim()) && parsed === null
  raw.value = formatEuroInput(value)
  emit('update:modelValue', value)
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
    :color="invalid ? 'error' : undefined"
    :highlight="invalid"
    :aria-invalid="invalid"
    class="w-full tabular-nums"
    @focus="focus"
    @update:model-value="update"
    @blur="blur"
  >
    <template #trailing><span class="text-sm font-medium text-[var(--color-muted)]">€</span></template>
  </UInput>
</template>
