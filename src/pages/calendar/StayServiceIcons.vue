<script setup lang="ts">
import type { Stay } from '#fsd/entities/stay'
import { formatEuro } from '#fsd/shared/lib'
import { compactStayServices } from './model/stay-service-icons'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  services?: Stay['services']
  cashAmountEur?: number | null
  cashTaskState?: Stay['cashTaskState']
  compact?: boolean
  max?: number
}>(), { cashAmountEur: null, cashTaskState: 'none', compact: true, max: 3 })
const { t } = useI18n()

const services = computed(() => props.services ?? [])
const hasCash = computed(() => typeof props.cashAmountEur === 'number' && props.cashAmountEur > 0)
const compacted = computed(() => compactStayServices(services.value, props.max))
const visibleServices = computed(() => props.compact ? compacted.value.visible : services.value)
const hiddenCount = computed(() => props.compact ? compacted.value.hiddenCount : 0)
const label = computed(() => services.value.map(service => service.nameSnapshot).join(', '))
const cashStateLabel = computed(() => ({ none: t('cash.noTask'), pending: t('cash.toCollect'), collected: t('cash.collected') })[props.cashTaskState ?? 'none'])
const cashLabel = computed(() => hasCash.value ? `${t('calendar.cash')}: ${formatEuro(props.cashAmountEur!)}. ${cashStateLabel.value}` : '')
const compactLabel = computed(() => [label.value ? `${t('calendar.extraServices')}: ${label.value}` : '', cashLabel.value].filter(Boolean).join('. '))
</script>

<template>
  <span v-if="services.length || (compact && hasCash)" v-bind="compact ? { class: 'stay-service-icons', title: compactLabel, 'aria-label': compactLabel } : { class: 'stay-service-list', 'aria-label': `${t('calendar.extraServices')}: ${label}` }">
    <template v-if="compact">
      <span v-for="service in visibleServices" :key="service.id" class="stay-service-icon" :title="service.nameSnapshot" aria-hidden="true"><UIcon :name="service.iconNameSnapshot" class="size-3.5" /></span>
      <span v-if="hiddenCount" class="stay-service-icons__more" :title="label">+{{ hiddenCount }}</span>
      <span v-if="hasCash" class="stay-service-icon stay-service-icon--cash" :class="`stay-service-icon--cash-${cashTaskState}`" aria-hidden="true"><UIcon name="i-lucide-euro" class="size-3.5" /></span>
    </template>
    <template v-else>
      <span v-for="service in visibleServices" :key="service.id" class="stay-service-list__item"><span class="stay-service-list__icon"><UIcon :name="service.iconNameSnapshot" class="size-3.5" /></span><span>{{ service.nameSnapshot }}</span></span>
    </template>
  </span>
</template>
