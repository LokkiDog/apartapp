<script lang="ts">
const dateFormatter = new Intl.DateTimeFormat('ru-RU')
</script>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PlatformClient } from '@contracts/platform'
import { StatusBadge } from '#fsd/shared/ui'

const props = defineProps<{
  client: PlatformClient
  layout: 'table' | 'list'
  actions: DropdownMenuItem[]
  pending: boolean
  enteringClientId: string | null
}>()
const emit = defineEmits<{ enter: []; 'update:messaging': [enabled: boolean] }>()

const table = computed(() => props.layout === 'table')
const cell = computed(() => table.value ? 'td' : 'div')
const createdOn = computed(() => dateFormatter.format(new Date(props.client.createdAt)))
</script>

<template>
  <component
    :is="table ? 'tr' : 'li'"
    :class="table ? '[&>td]:px-3 [&>td]:py-2' : 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 px-3 py-2.5'"
  >
    <component :is="cell" class="min-w-0" :class="table ? '!ps-4' : ''">
      <div class="flex items-center gap-2.5">
        <span v-if="table" class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <UIcon name="i-lucide-building-2" class="size-4" />
        </span>
        <div class="min-w-0 wrap-anywhere">
          <p class="text-sm font-semibold">{{ client.name }}</p>
          <p class="text-xs text-[var(--color-muted)]">
            {{ client.timezone }} · <time :datetime="client.createdAt">{{ createdOn }}</time>
          </p>
        </div>
      </div>
    </component>
    <component :is="cell" class="min-w-0 space-y-1.5" :class="table ? '' : 'col-span-2 row-start-2'">
      <div v-for="admin in client.administrators" :key="admin.id" class="min-w-0 wrap-anywhere text-sm">
        <p :class="table ? 'font-medium' : ''">{{ admin.name }}</p>
        <p class="text-xs text-[var(--color-muted)]">
          {{ admin.email }}<span v-if="admin.status === 'invited'"> · Приглашён</span>
        </p>
      </div>
      <p v-if="!client.administrators.length && table" class="text-sm text-[var(--color-muted)]">—</p>
    </component>
    <component :is="cell" :class="table ? '' : 'col-start-2 row-start-1 justify-self-end'">
      <StatusBadge
        :tone="client.status === 'active' ? 'success' : 'danger'"
        :label="client.status === 'active' ? 'Активен' : 'Заблокирован'"
        class="registry-status"
      />
    </component>
    <component :is="cell" :class="table ? '' : 'col-span-2 row-start-3 self-center min-[380px]:col-span-1'">
      <USwitch
        :model-value="client.messagingEnabled"
        :label="table ? (client.messagingEnabled ? 'Включены' : 'Выключены') : 'Сообщения'"
        :aria-label="`Сообщения: ${client.name}`"
        :disabled="pending"
        class="min-h-11 items-center"
        :ui="{ root: 'gap-2', label: 'text-xs' }"
        @update:model-value="emit('update:messaging', $event)"
      />
    </component>
    <component :is="cell" :class="table ? '!pe-4' : 'col-span-2 justify-self-end min-[380px]:col-span-1 min-[380px]:col-start-2 min-[380px]:row-start-3'">
      <div class="flex items-center justify-end gap-0.5">
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
          class="whitespace-nowrap"
          :loading="enteringClientId === client.id"
          :disabled="enteringClientId !== null"
          :aria-label="`Открыть CRM: ${client.name}`"
          @click="emit('enter')"
        >Открыть CRM</UButton>
        <UDropdownMenu
          :items="actions"
          :content="{ align: 'end' }"
          :modal="false"
          :ui="{ item: 'min-h-11 cursor-pointer', itemLabel: 'whitespace-normal wrap-anywhere' }"
        >
          <UButton icon="i-lucide-ellipsis" :aria-label="`Действия: ${client.name}`" color="neutral" variant="ghost" class="size-11 justify-center" />
        </UDropdownMenu>
      </div>
    </component>
  </component>
</template>

<style scoped>
.status-badge.registry-status {
  background: transparent;
  padding-inline: 0;
}
</style>
