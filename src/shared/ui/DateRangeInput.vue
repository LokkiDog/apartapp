<script setup lang="ts">
import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

const props = withDefaults(defineProps<{
  start?: string | null
  end?: string | null
  placeholder?: string
  disabled?: boolean
  required?: boolean
  isDateDisabled?: (date: DateValue) => boolean
}>(), {
  start: '',
  end: '',
  placeholder: 'Выберите даты',
  disabled: false,
  required: false,
  isDateDisabled: undefined
})

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
}>()

const open = ref(false)
const calendarValue = computed<DateRange | null>({
  get: () => props.start
    ? { start: parseDate(props.start), end: props.end ? parseDate(props.end) : undefined }
    : null,
  set: value => {
    emit('update:start', value?.start?.toString() ?? '')
    emit('update:end', value?.end?.toString() ?? '')
    if (value?.start && value.end) open.value = false
  }
})
const calendarPlaceholder = computed<DateValue>(() => props.start ? parseDate(props.start) : today(getLocalTimeZone()))
const hasCompleteRange = computed(() => Boolean(props.start && props.end))
const formatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })

function formatValue(value?: string | null) {
  return value ? formatter.format(new Date(`${value}T12:00:00Z`)) : 'Не выбрано'
}

const displayValue = computed(() => {
  if (!props.start) return props.placeholder
  return `${formatValue(props.start)} — ${props.end ? formatValue(props.end) : 'выберите выезд'}`
})

function clear() {
  emit('update:start', '')
  emit('update:end', '')
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 8, collisionPadding: 12 }">
    <template #default>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        :disabled="disabled"
        :aria-required="required"
        :aria-invalid="required && !hasCompleteRange"
        class="date-input-trigger date-range-input-trigger"
      >
        <UIcon name="i-lucide-calendar-range" class="size-4 shrink-0 text-[var(--color-primary)]" />
        <span class="date-input-trigger__value" :class="{ 'date-input-trigger__placeholder': !start }">{{ displayValue }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-[var(--color-muted)]" />
      </UButton>
    </template>

    <template #content>
      <div class="date-input-popover date-range-input-popover">
        <UCalendar
          v-model="calendarValue"
          :placeholder="calendarPlaceholder"
          range
          locale="ru-RU"
          color="primary"
          variant="solid"
          size="md"
          month-controls
          year-controls
          :is-date-disabled="isDateDisabled"
        />
        <div class="date-range-input-popover__hint">
          <span><strong>Заезд</strong>{{ formatValue(start) }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
          <span><strong>Выезд</strong>{{ formatValue(end) }}</span>
        </div>
        <div v-if="start" class="date-input-popover__actions">
          <UButton type="button" color="neutral" variant="ghost" size="sm" @click="clear">Очистить</UButton>
        </div>
      </div>
    </template>
  </UPopover>
  <input type="hidden" :value="start ?? ''" :required="required" :disabled="disabled">
  <input type="hidden" :value="end ?? ''" :required="required" :disabled="disabled">
</template>
