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
  placeholder: '',
  disabled: false,
  required: false,
  clearable: true
})
const { locale, t } = useI18n()
const { id, color, highlight, ariaAttrs, emitFormBlur, emitFormFocus, emitFormInput, emitFormChange } = useFormField(props)
const calendarLocale = computed(() => locale.value === 'en' ? 'en-US' : locale.value === 'he' ? 'he-IL' : 'ru-RU')
const placeholderText = computed(() => props.placeholder || t('common.chooseDate'))

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const calendarValue = computed<DateValue | undefined>({
  get: () => props.modelValue ? parseDate(props.modelValue) : undefined,
  set: value => {
    const next = value?.toString() ?? ''
    emit('update:modelValue', next)
    emitFormInput()
    emitFormChange()
    if (next) open.value = false
  }
})
const calendarPlaceholder = computed(() => props.modelValue ? parseDate(props.modelValue) : today(getLocalTimeZone()))
const displayValue = computed(() => {
  if (!props.modelValue) return placeholderText.value
  return new Intl.DateTimeFormat(calendarLocale.value, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${props.modelValue}T12:00:00Z`))
})

function clear() {
  emit('update:modelValue', '')
  emitFormInput()
  emitFormChange()
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
        :id="id"
        type="button"
        :color="color ?? 'neutral'"
        variant="outline"
        :highlight="highlight"
        :disabled="disabled"
        :aria-required="required"
        v-bind="ariaAttrs"
        class="date-input-trigger"
        @blur="emitFormBlur"
        @focus="emitFormFocus"
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
          :locale="calendarLocale"
          color="primary"
          variant="solid"
          size="md"
          month-controls
          year-controls
        />
        <div v-if="clearable || modelValue" class="date-input-popover__actions">
          <UButton v-if="clearable && modelValue" type="button" color="neutral" variant="ghost" size="sm" @click="clear">{{ t('common.clear') }}</UButton>
          <UButton type="button" color="primary" variant="soft" size="sm" @click="chooseToday">{{ t('common.today') }}</UButton>
        </div>
      </div>
    </template>
  </UPopover>
  <input type="hidden" :value="modelValue ?? ''" :disabled="disabled">
</template>
