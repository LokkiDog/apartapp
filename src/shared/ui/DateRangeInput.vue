<script setup lang="ts">
import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

const props = withDefaults(defineProps<{
  start?: string | null
  end?: string | null
  placeholder?: string
  startLabel?: string
  endLabel?: string
  disabled?: boolean
  required?: boolean
  isDateDisabled?: (date: DateValue) => boolean
}>(), {
  start: '',
  end: '',
  placeholder: '',
  startLabel: '',
  endLabel: '',
  disabled: false,
  required: false,
  isDateDisabled: undefined
})
const { locale, t } = useI18n()
const { id, color, highlight, ariaAttrs, emitFormBlur, emitFormFocus, emitFormInput, emitFormChange } = useFormField(props)
const calendarLocale = computed(() => locale.value === 'en' ? 'en-US' : locale.value === 'he' ? 'he-IL' : 'ru-RU')
const placeholderText = computed(() => props.placeholder || t('common.chooseDates'))
const startLabelText = computed(() => props.startLabel || t('calendar.arrival'))
const endLabelText = computed(() => props.endLabel || t('calendar.departure'))

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
    emitFormInput()
    emitFormChange()
    if (value?.start && value.end) open.value = false
  }
})
const calendarPlaceholder = computed<DateValue>(() => props.start ? parseDate(props.start) : today(getLocalTimeZone()))
const formatter = computed(() => new Intl.DateTimeFormat(calendarLocale.value, { day: '2-digit', month: 'short', year: 'numeric' }))

function formatValue(value?: string | null) {
  return value ? formatter.value.format(new Date(`${value}T12:00:00Z`)) : t('common.notSelected')
}

const displayValue = computed(() => {
  if (!props.start) return placeholderText.value
  return `${formatValue(props.start)} — ${props.end ? formatValue(props.end) : t('calendarExtra.chooseDeparture')}`
})

function clear() {
  emit('update:start', '')
  emit('update:end', '')
  emitFormInput()
  emitFormChange()
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 8, collisionPadding: 12 }">
    <template #default>
      <UButton
        :id="id"
        type="button"
        :color="color ?? 'neutral'"
        variant="outline"
        :highlight="highlight"
        :disabled="disabled"
        :aria-required="required"
        v-bind="ariaAttrs"
        class="date-input-trigger date-range-input-trigger"
        @blur="emitFormBlur"
        @focus="emitFormFocus"
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
          :locale="calendarLocale"
          color="primary"
          variant="solid"
          size="md"
          month-controls
          year-controls
          :is-date-disabled="isDateDisabled"
        />
        <div class="date-range-input-popover__hint">
          <span><strong>{{ startLabelText }}</strong>{{ formatValue(start) }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
          <span><strong>{{ endLabelText }}</strong>{{ formatValue(end) }}</span>
        </div>
        <div v-if="start" class="date-input-popover__actions">
          <UButton type="button" color="neutral" variant="ghost" size="sm" @click="clear">{{ t('common.clear') }}</UButton>
        </div>
      </div>
    </template>
  </UPopover>
  <input type="hidden" :value="start ?? ''" :disabled="disabled">
  <input type="hidden" :value="end ?? ''" :disabled="disabled">
</template>
