<script setup lang="ts">
import { LanguageSwitcher } from '#fsd/app'
</script>

<template>
  <main class="auth-shell">
    <section class="auth-shell__intro">
      <NuxtLink to="/login" class="brand-mark text-2xl">aparts<span>.</span></NuxtLink>
      <div>
        <p class="text-sm font-semibold uppercase tracking-[.12em] text-[var(--color-primary)]">
          {{ $t('auth.eyebrow') }}
        </p>
        <h1 class="mt-4 max-w-xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">
          {{ $t('auth.introTitle') }}
        </h1>
        <p class="mt-5 max-w-lg text-lg leading-8 text-[var(--color-muted)]">
          {{ $t('auth.introText') }}
        </p>
      </div>
      <p class="text-sm text-[var(--color-muted)]">© {{ new Date().getFullYear() }} aparts.</p>
    </section>

    <section class="auth-shell__content">
      <div class="w-full max-w-md">
        <div class="mb-10 flex items-center justify-between lg:justify-end">
          <NuxtLink to="/login" class="brand-mark text-2xl lg:hidden">aparts<span>.</span></NuxtLink>
          <LanguageSwitcher :persist="false" />
        </div>
        <slot />
      </div>
    </section>
  </main>
</template>
