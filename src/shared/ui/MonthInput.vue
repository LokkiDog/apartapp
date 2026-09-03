<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
}>(), {
  disabled: false
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale, t } = useI18n()
const open = ref(false)
const visibleYear = ref(Number(props.modelValue.slice(0, 4)) || new Date().getUTCFullYear())
const calendarLocale = computed(() => locale.value === 'en' ? 'en-US' : locale.value === 'he' ? 'he-IL' : 'ru-RU')
const selectedYear = computed(() => Number(props.modelValue.slice(0, 4)))
const selectedMonth = computed(() => Number(props.modelValue.slice(5, 7)))
const displayValue = computed(() => new Intl.DateTimeFormat(calendarLocale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${props.modelValue}-01T12:00:00Z`)))
const months = computed(() => Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  short: new Intl.DateTimeFormat(calendarLocale.value, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 1))),
  long: new Intl.DateTimeFormat(calendarLocale.value, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 1)))
})))

watch(open, (isOpen) => {
  if (isOpen) visibleYear.value = selectedYear.value || new Date().getUTCFullYear()
})

function chooseMonth(month: number) {
  emit('update:modelValue', `${visibleYear.value}-${String(month).padStart(2, '0')}`)
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', sideOffset: 8, collisionPadding: 12 }">
    <UButton type="button" color="neutral" variant="outline" class="month-input-trigger" :disabled="disabled" :aria-label="t('dashboard.monthPicker')">
      <UIcon name="i-lucide-calendar-days" class="size-4 shrink-0 text-[var(--color-primary)]" />
      <span class="month-input-trigger__value">{{ displayValue }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-[var(--color-muted)]" />
    </UButton>

    <template #content>
      <div class="month-input-popover">
        <div class="month-input-popover__header">
          <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-chevron-left" class="min-h-11 min-w-11" :aria-label="String(visibleYear - 1)" @click="visibleYear--" />
          <strong class="tabular-nums">{{ visibleYear }}</strong>
          <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-chevron-right" class="min-h-11 min-w-11" :aria-label="String(visibleYear + 1)" @click="visibleYear++" />
        </div>
        <div class="month-input-popover__grid">
          <UButton
            v-for="item in months"
            :key="item.value"
            type="button"
            :color="visibleYear === selectedYear && item.value === selectedMonth ? 'primary' : 'neutral'"
            :variant="visibleYear === selectedYear && item.value === selectedMonth ? 'soft' : 'ghost'"
            class="month-input-popover__month"
            :aria-label="item.long"
            :aria-pressed="visibleYear === selectedYear && item.value === selectedMonth"
            @click="chooseMonth(item.value)"
          >
            {{ item.short }}
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.month-input-trigger {
  min-height: 44px;
  min-width: 13rem;
  justify-content: space-between;
}
.month-input-trigger__value {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-weight: 600;
  text-align: start;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}
.month-input-popover {
  width: min(20rem, calc(100vw - 2rem));
  border-radius: 14px;
  background: var(--color-surface);
  padding: 0.5rem;
  box-shadow: var(--shadow-overlay);
}
.month-input-popover__header {
  display: grid;
  min-height: 44px;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  text-align: center;
}
.month-input-popover__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.25rem;
  padding: 0.25rem;
}
.month-input-popover__month {
  min-height: 44px;
  justify-content: center;
  text-transform: capitalize;
}
</style>
