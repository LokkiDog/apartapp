<script setup lang="ts">
import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  placeholder?: string
  disabled?: boolean
  required?: boolean
  clearable?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Выберите дату',
  disabled: false,
  required: false,
  clearable: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const calendarValue = computed<DateValue | undefined>({
  get: () => props.modelValue ? parseDate(props.modelValue) : undefined,
  set: value => {
    const next = value?.toString() ?? ''
    emit('update:modelValue', next)
    if (next) open.value = false
  }
})
const calendarPlaceholder = computed(() => props.modelValue ? parseDate(props.modelValue) : today(getLocalTimeZone()))
const displayValue = computed(() => {
  if (!props.modelValue) return props.placeholder
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${props.modelValue}T12:00:00Z`))
})

function clear() {
  emit('update:modelValue', '')
  open.value = false
}

function chooseToday() {
  calendarValue.value = today(getLocalTimeZone())
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 8 }">
    <template #default>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        :disabled="disabled"
        :aria-required="required"
        :aria-invalid="required && !modelValue"
        class="date-input-trigger"
      >
        <UIcon name="i-lucide-calendar-days" class="size-4 shrink-0 text-[var(--color-primary)]" />
        <span class="date-input-trigger__value" :class="{ 'date-input-trigger__placeholder': !modelValue }">{{ displayValue }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-[var(--color-muted)]" />
      </UButton>
    </template>

    <template #content>
      <div class="date-input-popover">
        <UCalendar
          v-model="calendarValue"
          :placeholder="calendarPlaceholder"
          locale="ru-RU"
          color="primary"
          variant="solid"
          size="md"
          month-controls
          year-controls
        />
        <div v-if="clearable || modelValue" class="date-input-popover__actions">
          <UButton v-if="clearable && modelValue" type="button" color="neutral" variant="ghost" size="sm" @click="clear">Очистить</UButton>
          <UButton type="button" color="primary" variant="soft" size="sm" @click="chooseToday">Сегодня</UButton>
        </div>
      </div>
    </template>
  </UPopover>
  <input type="hidden" :value="modelValue ?? ''" :required="required" :disabled="disabled">
</template>
