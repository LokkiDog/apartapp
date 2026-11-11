<script setup lang="ts">
defineProps<{
  name: string
  icon: string
  status: string
  tone?: 'success' | 'error'
}>()

const expanded = defineModel<boolean>('expanded', { default: false })
const { t } = useI18n()
const panelId = useId()
</script>

<template>
  <li class="border-t border-[var(--color-line)]">
    <div
      class="integration-row"
      :class="{ 'integration-row--interactive': $slots.default && !$slots.action }"
      @click="$slots.default && !$slots.action && (expanded = !expanded)"
    >
      <span class="integration-icon" aria-hidden="true">
        <UIcon :name="icon" class="size-4" />
      </span>
      <h3 class="integration-name font-semibold">{{ name }}</h3>
      <span
        class="integration-status flex min-w-0 items-center gap-1.5 text-xs"
        :class="{
          'integration-status--error': tone === 'error',
          'integration-status--success': tone === 'success'
        }"
        role="status"
      >
        <UIcon v-if="tone === 'error'" name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" />
        {{ status }}
      </span>
      <div class="integration-action">
        <slot name="action">
          <UButton
            v-if="$slots.default"
            color="primary"
            variant="ghost"
            :trailing-icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="min-h-11"
            :aria-expanded="expanded"
            :aria-controls="panelId"
            :aria-label="`${t('messaging.configureIntegration')} ${name}`"
            @click.stop="expanded = !expanded"
          >{{ t('messaging.configureIntegration') }}</UButton>
        </slot>
      </div>
    </div>
    <div v-if="$slots.default" v-show="expanded" :id="panelId" class="integration-detail space-y-2">
      <slot />
    </div>
  </li>
</template>

<style scoped>
.integration-row {
  display: grid;
  grid-template-columns: 2.125rem minmax(0, 1fr) minmax(0, 1.25fr) 8.5rem;
  gap: 0.625rem;
  align-items: center;
  min-height: 3.375rem;
  padding: 0.25rem 0.875rem;
}

.integration-row--interactive {
  cursor: pointer;
}

@media (hover: hover) {
  .integration-row--interactive:hover {
    background-color: var(--color-surface-muted);
  }
}

.integration-row--interactive:active {
  background-color: var(--color-primary-soft);
}

.integration-icon {
  display: grid;
  place-items: center;
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 0.5625rem;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.integration-status {
  color: var(--color-muted);
}

.integration-status--error {
  color: var(--tone-danger-ink);
}

.integration-status--success {
  color: var(--tone-success-ink);
}

.integration-action {
  justify-self: end;
}

.integration-detail {
  padding-block: 0.25rem 0.875rem;
  padding-inline: 3.625rem 0.875rem;
}

@media (max-width: 639px) {
  .integration-row {
    grid-template-columns: 2.125rem minmax(0, 1fr) auto;
    gap: 0 0.5rem;
    padding-inline: 0.625rem;
  }

  .integration-icon,
  .integration-action {
    grid-row: 1 / span 2;
  }

  .integration-name {
    grid-area: 1 / 2;
    align-self: end;
  }

  .integration-status {
    grid-area: 2 / 2;
    align-self: start;
  }

  .integration-action {
    grid-column: 3;
  }

  .integration-detail {
    padding-inline: 0.75rem;
  }
}
</style>
