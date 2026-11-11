<script setup lang="ts">
import RequestMessagingSetupButton from './RequestMessagingSetupButton.vue'
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
    :ui="{
      content: 'sm:max-w-2xl',
      header: 'shrink-0',
      body: 'min-h-0 overscroll-contain',
      footer: 'shrink-0',
    }"
  >
    <template #body>
      <ol class="space-y-5">
        <li v-for="(step, index) in steps" :key="step.key" class="space-y-2">
          <h3 class="font-semibold">
            {{ index + 1 }}. {{ t(`messaging.instructions.${step.key}Title`) }}
          </h3>
          <i18n-t :keypath="`messaging.instructions.${step.key}Text`" tag="p" class="text-sm leading-6 text-[var(--color-muted)]">
            <template v-if="step.key === 'create'" #botFather>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                class="font-bold text-[var(--color-primary-strong)] underline underline-offset-2 hover:text-[var(--color-primary)]"
              >@BotFather</a>
            </template>
          </i18n-t>
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
      <a
        href="https://core.telegram.org/bots/features#creating-a-new-bot"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary-strong)] underline underline-offset-2 hover:text-[var(--color-primary)]"
      >{{ t('messaging.instructions.officialGuide') }}</a>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <RequestMessagingSetupButton channel="telegram" />
        <UButton class="ms-auto min-h-11 shrink-0" @click="open = false">{{
          t('messaging.instructions.done')
        }}</UButton>
      </div>
    </template>
  </UModal>
</template>
