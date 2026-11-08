<script setup lang="ts">
import createBotScreen from './assets/botfather-create.svg'
import usernameScreen from './assets/botfather-username.svg'
import tokenScreen from './assets/botfather-token.svg'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const steps = [
  { key: 'create', image: createBotScreen },
  { key: 'username', image: usernameScreen },
  { key: 'token', image: tokenScreen },
  { key: 'connect', image: null },
] as const
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('messaging.instructions.title')"
    :description="t('messaging.instructions.description')"
    :scrollable="true"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UButton
        to="https://t.me/BotFather"
        target="_blank"
        rel="noopener noreferrer"
        color="neutral"
        variant="outline"
        icon="i-lucide-external-link"
        class="min-h-11 mb-5"
        >{{ t('messaging.instructions.openBotFather') }}</UButton
      >
      <ol class="space-y-5">
        <li v-for="(step, index) in steps" :key="step.key" class="space-y-2">
          <h3 class="font-semibold">
            {{ index + 1 }}. {{ t(`messaging.instructions.${step.key}Title`) }}
          </h3>
          <p class="text-sm leading-6 text-[var(--color-muted)]">
            {{ t(`messaging.instructions.${step.key}Text`) }}
          </p>
          <figure
            v-if="step.image"
            class="overflow-hidden rounded-xl border border-[var(--color-line)]"
          >
            <img
              :src="step.image"
              :alt="t(`messaging.instructions.${step.key}Alt`)"
              width="640"
              height="420"
              class="block w-full h-auto"
              loading="lazy"
            />
          </figure>
        </li>
      </ol>
      <p class="mt-5 text-sm text-[var(--color-muted)]">
        {{ t('messaging.instructions.exampleNote') }}
      </p>
      <p class="mt-3 text-sm">{{ t('messaging.instructions.tokenPrivacy') }}</p>
      <UButton
        to="https://core.telegram.org/bots/features#creating-a-new-bot"
        target="_blank"
        rel="noopener noreferrer"
        color="neutral"
        variant="link"
        class="mt-2 min-h-11 px-0"
        >{{ t('messaging.instructions.officialGuide') }}</UButton
      >
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <UButton class="ms-auto min-h-11" @click="open = false">{{
          t('messaging.instructions.done')
        }}</UButton>
      </div>
    </template>
  </UModal>
</template>
