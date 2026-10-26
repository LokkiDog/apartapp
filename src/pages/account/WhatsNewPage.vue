<script setup lang="ts">
import { Translation } from 'vue-i18n'
import { PageHeader } from '#fsd/shared/ui'
import { changelog } from './model/changelog'

const { t, locale } = useI18n()
function releaseDate(date: string) {
  const language = locale.value === 'he' ? 'he-IL' : locale.value === 'en' ? 'en-US' : 'ru-RU'
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <div class="changelog-content space-y-6">
      <PageHeader :title="t('account.whatsNew')" :description="t('changelog.description')" />
      <ol class="space-y-6">
        <li v-for="release in changelog" :key="release.version">
          <article class="surface overflow-hidden" :aria-labelledby="`release-${release.version}`">
            <header class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] p-5 sm:p-6">
              <div class="min-w-0 space-y-2">
                <h2 :id="`release-${release.version}`" class="text-lg font-semibold leading-6">{{ t('changelog.version', { version: release.version }) }}</h2>
                <p class="text-pretty text-sm leading-5">{{ t(`changelog.titles.${release.title}`) }}</p>
                <p class="text-sm text-[var(--color-muted)]">
                  <time :datetime="release.date">{{ release.status === 'upcoming' ? `${t('changelog.prepared')} ${releaseDate(release.date)}` : releaseDate(release.date) }}</time>
                </p>
              </div>
              <UBadge :color="release.status === 'upcoming' ? 'primary' : 'neutral'" variant="soft" class="shrink-0">{{ t(`changelog.status.${release.status}`) }}</UBadge>
            </header>
            <div class="divide-y divide-[var(--color-line)]">
              <section v-for="group in release.groups" :key="group.kind" class="space-y-3 p-5 sm:p-6">
                <h3 class="text-sm font-semibold">{{ t(`changelog.groups.${group.kind}`) }}</h3>
                <ul class="changelog-notes space-y-2 text-sm leading-6">
                  <Translation v-for="item in group.items" :key="item" :keypath="`changelog.items.${item}`" tag="li" scope="global" class="text-pretty">
                    <template #highlight><strong>{{ t(`changelog.highlights.${item}`) }}</strong></template>
                  </Translation>
                </ul>
              </section>
            </div>
          </article>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.changelog-content {
  max-width: 56rem;
  margin-inline: auto;
}
.changelog-notes {
  list-style: disc;
  padding-inline-start: 1.25rem;
}
.changelog-notes li::marker {
  color: var(--color-muted);
}
</style>
