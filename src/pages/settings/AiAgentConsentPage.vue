<script setup lang="ts">
import { aiAgentNames, type AiAgentPermission, type AiAgentProvider } from '@contracts/ai-agents'

const route = useRoute()
const { t } = useI18n()
const pending = ref(false)
const decisionError = ref(false)
const { data, status, error } = await useAsyncData('ai-agent-consent', () => $fetch<{
  userId: string; organizationId: string; organizationName?: string; permissions: AiAgentPermission[]
  provider: AiAgentProvider; callbackHost: string
}>('/api/ai-agents/consent', { query: route.query }), { server: false, watch: [() => route.fullPath] })
watch(error, cause => {
  if (cause?.statusCode === 401) {
    void navigateTo({ path: '/login', query: { agentConsent: route.fullPath } }, { replace: true })
  }
})

async function decide(decision: 'allow' | 'deny') {
  if (!data.value || pending.value) return
  pending.value = true
  decisionError.value = false
  try {
    const { userId, organizationId, permissions } = data.value
    const { redirect } = await $fetch('/api/ai-agents/consent', {
      method: 'POST', body: { userId, organizationId, permissions, request: route.query, decision }
    })
    window.location.replace(redirect)
  } catch {
    decisionError.value = true
    pending.value = false
  }
}
</script>

<template>
  <section class="surface auth-card space-y-4">
    <h1 class="auth-card__title">{{ t(data ? 'aiAgents.consentTitle' : 'aiAgents.consentHeading', { agent: data ? aiAgentNames[data.provider] : '' }) }}</h1>
    <template v-if="data">
      <p>{{ t('aiAgents.consentDescription', { agent: aiAgentNames[data.provider], organization: data.organizationName }) }}</p>
      <p class="text-sm text-[var(--color-muted)]">{{ t('aiAgents.consentReturnHost', { host: data.callbackHost }) }}</p>
      <ul class="list-disc ps-5">
        <li v-for="permission in data.permissions" :key="permission">{{ t(`aiAgents.${permission}`) }}</li>
      </ul>
      <UAlert v-if="decisionError" color="error" :description="t('aiAgents.consentError')" />
      <div class="form-actions">
        <UButton variant="ghost" color="neutral" class="min-h-11" :disabled="pending" @click="decide('deny')">{{ t('common.cancel') }}</UButton>
        <UButton class="min-h-11" :loading="pending" @click="decide('allow')">{{ t('aiAgents.allow') }}</UButton>
      </div>
    </template>
    <UAlert v-else-if="error && error.statusCode !== 401" color="error" :description="t('aiAgents.consentError')" />
    <p v-else-if="status === 'pending' || error?.statusCode === 401" role="status">{{ t('aiAgents.loading') }}</p>
  </section>
</template>
