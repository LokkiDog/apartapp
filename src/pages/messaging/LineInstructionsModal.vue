<script setup lang="ts">
import RequestMessagingSetupButton from './RequestMessagingSetupButton.vue'
import connectScreen from './assets/line-crm-connect.png'

const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const media = 'https://developers.line.biz/media/messaging-api'
const steps = [
  {
    key: 'account',
    image: `${media}/getting-started/oa-entry-form-en.webp`,
    link: 'https://entry.line.biz/form/entry/unverified',
    linkLabel: 'LINE Official Account',
  },
  {
    key: 'enable',
    path: 'Settings → Messaging API → Enable Messaging API',
    image: 'https://www.lycbiz.com/sites/default/files/styles/image_webp/public/inline-images/messaging%20API.jpg.webp?itok=4PzXaFD3',
    link: 'https://manager.line.biz/',
    linkLabel: 'LINE Official Account Manager',
  },
  {
    key: 'channel',
    image: `${media}/getting-started/console-home-en.png`,
    link: 'https://developers.line.biz/console/',
    linkLabel: 'LINE Developers Console',
  },
  {
    key: 'secret',
    image: `${media}/verify-webhook-signature/channel-secret-en.png`,
  },
  {
    key: 'token',
    example: 'Messaging API → Channel access token (long-lived) → Issue',
  },
  { key: 'connect', image: connectScreen, pathKey: 'connectPath' },
  {
    key: 'webhook',
    link: 'https://developers.line.biz/console/',
    linkLabel: 'LINE Developers Console',
    image: `${media}/build-bot/webhook-url-example-com.png`,
  },
  {
    key: 'test',
    example: 'LINE → QR code → Add → Chat',
  },
]
const guide = 'messaging.line.guide'
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(`${guide}.title`)"
    :description="t(`${guide}.description`)"
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
            {{ index + 1 }}. {{ t(`${guide}.${step.key}Title`) }}
          </h3>
          <i18n-t :keypath="`${guide}.${step.key}Text`" tag="p" class="text-sm leading-6 text-[var(--color-muted)]">
            <template v-if="step.link" #link>
              <a
                :href="step.link"
                target="_blank"
                rel="noopener noreferrer"
                class="font-bold text-[var(--color-primary-strong)] underline underline-offset-2 hover:text-[var(--color-primary)]"
              >{{ step.linkLabel }}</a>
            </template>
            <template v-if="step.path || step.pathKey" #path>
              <strong class="font-semibold text-[var(--color-ink)]">
                {{ step.pathKey ? t(`${guide}.${step.pathKey}`) : step.path }}
              </strong>
            </template>
          </i18n-t>
          <figure v-if="step.image" class="overflow-hidden rounded-xl border border-[var(--color-line)]">
            <img
              :src="step.image"
              :alt="t(`${guide}.${step.key}Title`)"
              class="block h-auto w-full"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
          </figure>
          <p v-else dir="ltr" class="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <strong class="font-semibold">{{ step.example }}</strong>
          </p>
        </li>
      </ol>
      <p class="mt-5 text-sm text-[var(--color-muted)]">{{ t(`${guide}.note`) }}</p>
      <a
        href="https://developers.line.biz/en/docs/messaging-api/building-bot/"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary-strong)] underline underline-offset-2 hover:text-[var(--color-primary)]"
      >{{ t(`${guide}.official`) }}</a>
    </template>
    <template #footer>
      <div class="form-actions form-actions--footer">
        <RequestMessagingSetupButton channel="line" />
        <UButton class="ms-auto min-h-11 shrink-0" @click="open = false">
          {{ t('messaging.instructions.done') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
