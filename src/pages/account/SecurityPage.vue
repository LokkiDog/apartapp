<script setup lang="ts">
import { PageHeader } from '#fsd/shared/ui'
import { PasskeyManager } from '#fsd/features/manage-passkeys'
import ChangePasswordForm from './ChangePasswordForm.vue'
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="$t('account.security')" />
    <div class="grid items-start gap-4 md:grid-cols-2">
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ $t('passkeys.title') }}</h2>
        <PasskeyManager />
      </section>
      <section class="surface min-w-0 space-y-5 p-5 sm:p-6">
        <h2 class="text-lg font-semibold leading-6">{{ $t('account.changePassword') }}</h2>
        <ChangePasswordForm />
      </section>
    </div>
  </section>
</template>
