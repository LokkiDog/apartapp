<script setup lang="ts">
import { LanguageSwitcher } from '#fsd/app'
</script>

<template>
  <main class="auth-shell">
    <header class="auth-shell__header">
      <NuxtLink to="/login" class="brand-mark text-2xl">aparts<span>.</span></NuxtLink>
      <LanguageSwitcher :persist="false" labeled />
    </header>

    <section class="auth-shell__intro" aria-labelledby="auth-intro-title">
      <div class="auth-shell__story">
        <h1 id="auth-intro-title">{{ $t('auth.introTitle') }}</h1>
        <p>{{ $t('auth.introText') }}</p>
        <div class="auth-product" aria-hidden="true">
          <div class="auth-product__apartment">
            <img src="/illustrations/apartment.svg" alt="" width="640" height="440" />
            <span>{{ $t('auth.illustrationApartment') }}</span>
            <strong>204</strong>
          </div>
          <div class="auth-product__schedule">
            <div class="auth-product__event">
              <UIcon name="i-lucide-log-out" />
              <span>{{ $t('auth.illustrationCheckout') }}</span>
              <time>10:00</time>
            </div>
            <div class="auth-product__event auth-product__event--cleaning">
              <UIcon name="i-lucide-brush-cleaning" />
              <span>{{ $t('auth.illustrationCleaning') }}</span>
              <time>11:00</time>
            </div>
            <div class="auth-product__event">
              <UIcon name="i-lucide-wrench" />
              <span>{{ $t('auth.illustrationTask') }}</span>
              <time>14:30</time>
            </div>
            <div class="auth-product__ready">
              <UIcon name="i-lucide-list-checks" />
              <span>{{ $t('auth.illustrationChecklist') }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="auth-shell__content">
      <div class="auth-shell__form"><slot /></div>
    </section>

    <footer class="auth-shell__footer">© {{ new Date().getFullYear() }} Aparts</footer>
  </main>
</template>
