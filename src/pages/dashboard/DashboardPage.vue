<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useCurrentUser } from '#fsd/shared/auth'
import { PageHeader } from '#fsd/shared/ui'

const LegacyDashboard = defineAsyncComponent(() => import('./ui/LegacyDashboard.vue'))
const OperationsDashboard = defineAsyncComponent(() => import('./ui/OperationsDashboard.vue'))
const user = useCurrentUser()
const { t } = useI18n()
const administrator = computed(() => Boolean(user.value?.roles.includes('administrator')))
const accountKey = computed(() => user.value ? `${user.value.organizationId}:${user.value.id}` : '')
</script>

<template>
  <section class="page-wrap space-y-6">
    <template v-if="administrator">
      <PageHeader :title="t('nav.home')" />
      <OperationsDashboard :key="accountKey" />
    </template>
    <LegacyDashboard v-else-if="user" :key="accountKey" />
    <div v-else class="space-y-4" :aria-label="t('operations.loading')" aria-busy="true">
      <USkeleton class="h-16 w-full rounded-2xl" />
      <USkeleton class="h-64 w-full rounded-2xl" />
    </div>
  </section>
</template>
