<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { compactStayServices } from './model/stay-service-icons'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  services?: Stay['services']
  compact?: boolean
  max?: number
}>(), { compact: true, max: 3 })
const { t } = useI18n()

const services = computed(() => props.services ?? [])
const compacted = computed(() => compactStayServices(services.value, props.max))
const visibleServices = computed(() => props.compact ? compacted.value.visible : services.value)
const hiddenCount = computed(() => props.compact ? compacted.value.hiddenCount : 0)
const label = computed(() => services.value.map(service => service.nameSnapshot).join(', '))
</script>

<template>
  <span v-if="services.length" v-bind="compact ? { class: 'stay-service-icons', title: label, 'aria-label': `${t('calendar.extraServices')}: ${label}` } : { class: 'stay-service-list', 'aria-label': `${t('calendar.extraServices')}: ${label}` }">
    <template v-if="compact">
      <span v-for="service in visibleServices" :key="service.id" class="stay-service-icon" :title="service.nameSnapshot" aria-hidden="true"><UIcon :name="service.iconNameSnapshot" class="size-3.5" /></span>
      <span v-if="hiddenCount" class="stay-service-icons__more" :title="label">+{{ hiddenCount }}</span>
    </template>
    <template v-else>
      <span v-for="service in visibleServices" :key="service.id" class="stay-service-list__item"><span class="stay-service-list__icon"><UIcon :name="service.iconNameSnapshot" class="size-3.5" /></span><span>{{ service.nameSnapshot }}</span></span>
    </template>
  </span>
</template>
