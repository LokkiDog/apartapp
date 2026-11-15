<script setup lang="ts">
import { aiAgentNames, aiAgentProviders, type AiAgentProvider, type AiAgentSettings } from '@contracts/ai-agents'
import { canConnectAiAgents, useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, CopyField } from '#fsd/shared/ui'
import mcpSetupImage from './assets/chatgpt-mcp-setup.webp'
import pluginInstallImage from './assets/chatgpt-plugin-install.webp'
import desktopPluginsRu from './assets/chatgpt-desktop-plugins-ru.png'
import desktopAddMcpRu from './assets/chatgpt-desktop-add-mcp-ru.png'
import desktopConfigureRu from './assets/chatgpt-desktop-configure-ru.png'
import claudeConnectorImage from './assets/claude-custom-connector.png'
import chatgptMark from './assets/chatgpt-mark.svg'
import claudeMark from './assets/claude-mark.svg'
import geminiMark from './assets/gemini-mark.svg'

const { t, locale } = useI18n()
const user = useCurrentUser()
const allowed = computed(() => canConnectAiAgents(user.value))
const instructions = ref(false)
const guideProvider = ref<AiAgentProvider>('chatgpt')
const guidePlatform = ref('web')
const providerUi = {
  chatgpt: { logo: chatgptMark, setupUrl: 'https://chatgpt.com/plugins', openLabel: 'aiAgents.openChatgpt' },
  claude: { logo: claudeMark, setupUrl: 'https://claude.ai/customize/connectors', openLabel: 'aiAgents.openClaude' },
  gemini: { logo: geminiMark, setupUrl: 'https://gemini.google.com/', openLabel: 'aiAgents.openGemini' },
} as const
const claudeSteps = ['claudeOpen', 'claudeConfigure', 'claudeAuthorize', 'claudeTest']
const guideTabs = computed(() => guideProvider.value === 'gemini' ? [
  { value: 'web', label: t('aiAgents.guide.web'), steps: ['geminiOpen', 'geminiConfigure', 'geminiAuthorize', 'geminiTest'] },
  { value: 'mobile', label: t('aiAgents.guide.mobile'), steps: ['geminiMobileOpen', 'geminiTest'] },
] : guideProvider.value === 'claude' ? [
  { value: 'web', label: t('aiAgents.guide.web'), steps: claudeSteps },
  { value: 'desktop', label: t('aiAgents.guide.desktop'), steps: ['claudeDesktopOpen', ...claudeSteps.slice(1)] },
] : [
  { value: 'web', label: t('aiAgents.guide.web'), steps: ['open', 'configure', 'authorize', 'test'] },
  { value: 'desktop', label: t('aiAgents.guide.desktop'), steps: ['desktopOpen', 'desktopAdd', 'desktopConfigure', 'desktopAuthorize', 'test'] },
])
const guideLink = computed(() => guideProvider.value === 'gemini'
  ? 'https://support.google.com/gemini/answer/17209137'
  : guideProvider.value === 'claude'
  ? 'https://claude.com/docs/connectors/custom/add-unlisted'
  : guidePlatform.value === 'web'
    ? 'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt'
    : 'https://learn.chatgpt.com/docs/plugins')
const troubleshooting = computed(() => guideProvider.value === 'gemini' ? 'geminiTroubleshooting'
  : guideProvider.value === 'claude' ? 'claudeTroubleshooting'
  : guidePlatform.value === 'web' ? 'troubleshooting' : 'desktopTroubleshooting')
type GuideScreenshot = {
  url: string
  width: number
  height: number
  caption: string
  credit?: string
  source?: string
}
const installScreenshot = {
  url: pluginInstallImage,
  width: 1344,
  height: 181,
  caption: 'installScreenshot',
  credit: 'OpenAI',
  source: 'https://help.openai.com/en/articles/20001256-plugins-in-chatgpt',
}
const guideScreenshots = computed<Partial<Record<string, GuideScreenshot>>>(() => ({
  claudeConfigure: {
    url: claudeConnectorImage,
    width: 1600,
    height: 1296,
    caption: 'claudeConfigureScreenshot',
    credit: 'Semrush',
    source: 'https://www.semrush.com/blog/claude-code-seo/',
  },
  configure: {
    url: mcpSetupImage,
    width: 1250,
    height: 1620,
    caption: 'configureScreenshot',
    credit: 'Pinggy',
    source: 'https://pinggy.io/blog/turn_chatgpt_into_free_local_coding_agent_devspace/',
  },
  authorize: installScreenshot,
  ...(locale.value === 'ru' ? {
    desktopOpen: { url: desktopPluginsRu, width: 496, height: 426, caption: 'desktopOpenScreenshot' },
    desktopAdd: { url: desktopAddMcpRu, width: 822, height: 554, caption: 'desktopAddScreenshot' },
    desktopConfigure: { url: desktopConfigureRu, width: 1364, height: 1708, caption: 'desktopConfigureScreenshot' },
  } : { desktopAuthorize: installScreenshot }),
}))
const revokeOpen = ref(false)
const revokeProvider = ref<AiAgentProvider>('chatgpt')
const revoking = ref(false)
const copyFeedback = ref<'copied' | 'copyFailed'>()
const revokeFailed = ref(false)
const { data, status, error, refresh } = await useAsyncData<AiAgentSettings | null>('ai-agent-settings',
  () => allowed.value ? $fetch<AiAgentSettings>('/api/ai-agents') : Promise.resolve(null),
  { server: false, default: () => null, watch: [user] })

function refreshAfterReturning() {
  if (document.visibilityState === 'visible' && allowed.value) void refresh()
}
onMounted(() => document.addEventListener('visibilitychange', refreshAfterReturning))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshAfterReturning))

async function copyAddress() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(data.value.serverUrl)
    copyFeedback.value = 'copied'
  } catch {
    copyFeedback.value = 'copyFailed'
  }
}

async function revoke() {
  if (revoking.value) return
  revoking.value = true
  revokeFailed.value = false
  try {
    await $fetch('/api/ai-agents', { method: 'DELETE', query: { provider: revokeProvider.value } })
    revokeOpen.value = false
    await refresh()
  } catch {
    revokeFailed.value = true
  } finally {
    revoking.value = false
  }
}

function openGuide(provider: AiAgentProvider) {
  guidePlatform.value = 'web'
  guideProvider.value = provider
  copyFeedback.value = undefined
  instructions.value = true
}

function openRevoke(provider: AiAgentProvider) {
  revokeProvider.value = provider
  revokeFailed.value = false
  revokeOpen.value = true
}
</script>

<template>
  <section id="ai-agents" class="surface min-w-0 scroll-mt-24 space-y-4 p-4 sm:p-5" aria-labelledby="ai-agents-heading">
    <h2 id="ai-agents-heading" class="flex items-center gap-2 text-lg font-semibold leading-6">
      <UIcon name="i-lucide-bot" class="size-5 shrink-0" />
      {{ t('aiAgents.title') }}
    </h2>
    <div class="ai-agent-list border-t border-[var(--color-line)]">
      <p v-if="!data && (status === 'idle' || status === 'pending')" class="pt-3" role="status">{{ t('aiAgents.loading') }}</p>
      <div v-else-if="error" class="space-y-2 pt-3">
        <UAlert color="error" :description="t('aiAgents.unavailable')" />
        <UButton class="min-h-11" variant="outline" @click="refresh()">{{ t('aiAgents.retry') }}</UButton>
      </div>
      <div v-else-if="data" class="divide-y divide-[var(--color-line)]">
        <div v-for="provider in aiAgentProviders" :key="provider" class="ai-agent-row py-3 last:pb-0">
          <div class="ai-agent-identity flex min-w-0 items-center gap-3">
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-muted)]" :class="{ 'ai-agent-mark--claude': provider === 'claude' }">
              <img :src="providerUi[provider].logo" alt="" width="24" height="24" />
            </span>
            <div class="min-w-0">
              <h3 class="font-semibold">{{ aiAgentNames[provider] }}</h3>
              <p class="text-sm text-[var(--color-muted)]" role="status">{{ t(data.connections[provider] ? 'aiAgents.connected' : 'aiAgents.disconnected') }}</p>
            </div>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-book-open"
            class="ai-agent-guide min-h-11 justify-center"
            :aria-label="t('aiAgents.guide.forAgent', { agent: aiAgentNames[provider] })"
            aria-haspopup="dialog"
            @click="openGuide(provider)"
          >{{ t('aiAgents.guide.label') }}</UButton>
          <UButton
            v-if="data.connections[provider]"
            color="error"
            variant="outline"
            class="min-h-11 justify-center"
            :aria-label="t('aiAgents.revokeFor', { agent: aiAgentNames[provider] })"
            aria-haspopup="dialog"
            @click="openRevoke(provider)"
          >{{ t('aiAgents.disconnect') }}</UButton>
          <UButton
            v-else
            :to="providerUi[provider].setupUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="min-h-11 justify-center"
            :aria-label="t('aiAgents.connectFor', { agent: aiAgentNames[provider] })"
          >{{ t('aiAgents.connect') }}</UButton>
        </div>
      </div>
    </div>
    <UModal
      v-model:open="instructions"
      :title="t('aiAgents.guide.forAgent', { agent: aiAgentNames[guideProvider] })"
      :description="t('aiAgents.guide.description', { agent: aiAgentNames[guideProvider] })"
      :ui="{ content: 'sm:max-w-2xl', header: 'shrink-0', body: 'min-h-0 overscroll-contain', footer: 'shrink-0' }"
    >
      <template #body>
        <UTabs v-model="guidePlatform" :items="guideTabs" :ui="{ list: 'w-full', trigger: 'min-h-11 flex-1' }">
          <template #content="{ item }">
            <ol class="space-y-5 pt-3">
              <li v-for="(step, index) in item.steps" :key="step" class="space-y-2">
                <h3 class="font-semibold">{{ index + 1 }}. {{ t(`aiAgents.guide.${step}Title`) }}</h3>
                <p class="text-sm leading-6 text-[var(--color-muted)]">{{ t(`aiAgents.guide.${step}Text`) }}</p>
                <template v-if="['configure', 'desktopConfigure', 'claudeConfigure', 'geminiConfigure'].includes(step)">
                  <UFormField :label="t('aiAgents.serverUrl')">
                    <CopyField :value="data?.serverUrl" :copy-label="t('aiAgents.copy')" :copied="copyFeedback === 'copied'" @copy="copyAddress" />
                  </UFormField>
                  <p v-if="copyFeedback" class="text-sm" role="status">{{ t(`aiAgents.${copyFeedback}`) }}</p>
                </template>
                <figure
                  v-if="guideScreenshots[step]"
                  class="overflow-hidden rounded-xl border border-[var(--color-line)]"
                >
                  <a
                    :href="guideScreenshots[step].url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    <img
                      :src="guideScreenshots[step].url"
                      :alt="t(`aiAgents.guide.${guideScreenshots[step].caption}`)"
                      :width="guideScreenshots[step].width"
                      :height="guideScreenshots[step].height"
                      class="mx-auto block h-auto max-w-full"
                      loading="lazy"
                    />
                  </a>
                  <figcaption class="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)]">
                    {{ t(`aiAgents.guide.${guideScreenshots[step].caption}`) }}
                    <a v-if="guideScreenshots[step].source" :href="guideScreenshots[step].source" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">{{ guideScreenshots[step].credit }}</a>
                  </figcaption>
                </figure>
              </li>
            </ol>
            <p class="mt-5 text-sm text-[var(--color-muted)]">{{ t(`aiAgents.guide.${troubleshooting}`) }}</p>
            <a
              :href="guideLink"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary-strong)] underline underline-offset-2 hover:text-[var(--color-primary)]"
            >{{ t(guideProvider === 'gemini' ? 'aiAgents.guide.geminiOfficial' : guideProvider === 'claude' ? 'aiAgents.guide.claudeOfficial' : 'aiAgents.guide.official') }}</a>
          </template>
        </UTabs>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton class="min-h-11" color="neutral" variant="outline" @click="instructions = false">{{ t('common.close') }}</UButton>
          <UButton v-if="guidePlatform === 'web'" class="min-h-11" :to="providerUi[guideProvider].setupUrl" target="_blank" rel="noopener noreferrer" trailing-icon="i-lucide-external-link">{{ t(providerUi[guideProvider].openLabel) }}</UButton>
        </div>
      </template>
    </UModal>
    <ConfirmActionModal v-model:open="revokeOpen" :title="t('aiAgents.revokeFor', { agent: aiAgentNames[revokeProvider] })" :description="t('aiAgents.revokeDescription', { agent: aiAgentNames[revokeProvider] })" :confirm-label="t('aiAgents.revoke')" :loading="revoking" :error="revokeFailed ? t('aiAgents.revokeFailed') : undefined" @confirm="revoke" />
  </section>
</template>

<style scoped>
.ai-agent-list {
  container-type: inline-size;
}

.ai-agent-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 0.75rem;
}

.ai-agent-identity {
  grid-column: 1 / -1;
}

.ai-agent-mark--claude {
  background-color: color-mix(in srgb, #d97757 12%, var(--color-surface));
}

@container (min-width: 27rem) {
  .ai-agent-row {
    grid-template-columns: minmax(0, 1.1fr) minmax(max-content, 1fr) minmax(7.5rem, max-content);
  }

  .ai-agent-identity {
    grid-column: auto;
  }

  .ai-agent-guide {
    justify-self: start;
  }
}
</style>
