<script setup lang="ts">
defineProps<{ start: string, end: string, invalid?: boolean, describedBy?: string }>()
const emit = defineEmits<{ 'update:start': [value: string], 'update:end': [value: string] }>()
const { copy } = useSite()
const inputValue = (event: Event) => (event.target as HTMLInputElement).value
</script>
<template>
  <div class="guest-date-range" :class="{ 'guest-date-range--invalid': invalid }">
    <label><span>{{ copy.arrivalDate }}</span><input type="date" :value="start" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :aria-label="copy.arrivalDate" @input="emit('update:start', inputValue($event))"></label>
    <span class="guest-date-range-separator" aria-hidden="true">—</span>
    <label><span>{{ copy.departureDate }}</span><input type="date" :value="end" :min="start || undefined" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :aria-label="copy.departureDate" @input="emit('update:end', inputValue($event))"></label>
  </div>
</template>
