<script setup lang="ts">
import { switchClientContext, useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, PageHeader, EmptyState, StatusBadge } from '#fsd/shared/ui'
import type { PlatformClient } from '@contracts/platform'
const user = useCurrentUser()
const { data: clients, refresh, status, error: loadError } = await useAsyncData<PlatformClient[]>('system-clients', () => $fetch('/api/system/clients'), { server: false, default: () => [], watch: [user] })
const search = ref('')
const filtered = computed(() => clients.value.filter(client => `${client.name} ${client.administrators.map(admin => admin.email).join(' ')}`.toLowerCase().includes(search.value.toLowerCase())))
const open = ref(false); const pending = ref(false); const error = ref(''); const notice = ref('')
const selected = ref<PlatformClient | null>(null)
const kind = ref<'create' | 'edit' | 'invite'>('create')
const form = reactive({ name: '', timezone: 'Europe/Sofia', administratorName: '', email: '' })
const title = computed(() => kind.value === 'create' ? 'Новый клиент' : kind.value === 'edit' ? 'Изменить клиента' : 'Пригласить администратора')
const blockOpen = ref(false); const blockClient = ref<PlatformClient | null>(null)
function edit(client: PlatformClient | null, action: typeof kind.value) {
  selected.value = client; kind.value = action; error.value = ''
  Object.assign(form, { name: client?.name ?? '', timezone: client?.timezone ?? 'Europe/Sofia', administratorName: '', email: '' }); open.value = true
}
async function save() {
  pending.value = true; error.value = ''; notice.value = ''
  try {
    let result: { invitationSent?: boolean }
    if (kind.value === 'create') result = await $fetch('/api/system/clients', { method: 'POST', body: form })
    else if (kind.value === 'edit') result = await $fetch(`/api/system/clients/${selected.value!.id}`, { method: 'PATCH', body: { name: form.name, timezone: form.timezone } })
    else result = await $fetch(`/api/system/clients/${selected.value!.id}/administrators`, { method: 'POST', body: { name: form.administratorName, email: form.email } })
    notice.value = result.invitationSent === false ? 'Клиент и администратор сохранены. Письмо не отправлено — повторите приглашение через меню клиента.' : 'Сохранено'
    open.value = false; await refresh()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось сохранить' }
  finally { pending.value = false }
}
async function setStatus(client: PlatformClient, next: 'active' | 'blocked') {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/system/clients/${client.id}`, { method: 'PATCH', body: { status: next } }); blockOpen.value = false; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось изменить статус' }
  finally { pending.value = false }
}
async function resend(client: PlatformClient, administratorId: string) {
  error.value = ''; notice.value = ''
  try { await $fetch(`/api/system/clients/${client.id}/resend-invitation`, { method: 'POST', body: { userId: administratorId } }); notice.value = 'Приглашение отправлено' }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось отправить письмо' }
}
async function enter(client: PlatformClient) {
  try { await switchClientContext(client.id) }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось открыть клиента' }
}
function actions(client: PlatformClient) {
  return [
    { label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => edit(client, 'edit') },
    { label: 'Пригласить администратора', icon: 'i-lucide-user-plus', onSelect: () => edit(client, 'invite') },
    ...client.administrators.filter(admin => admin.status === 'invited').map(admin => ({ label: `Повторить приглашение: ${admin.email}`, icon: 'i-lucide-mail', onSelect: () => resend(client, admin.id) })),
    { label: client.status === 'active' ? 'Заблокировать' : 'Разблокировать', icon: 'i-lucide-lock', onSelect: () => {
      if (client.status === 'blocked') void setStatus(client, 'active')
      else { error.value = ''; blockClient.value = client; blockOpen.value = true }
    } }
  ]
}
</script>
<template>
  <section class="space-y-6">
    <PageHeader title="Клиенты" :description="`Всего: ${clients.length}`">
      <template #actions><UButton icon="i-lucide-plus" @click="edit(null, 'create')">Добавить</UButton></template>
    </PageHeader>
    <UInput v-model="search" placeholder="Найти клиента" icon="i-lucide-search" class="w-full md:max-w-sm" />
    <UAlert v-if="loadError || (error && !open && !blockOpen)" :description="error || 'Не удалось загрузить клиентов'" color="error">
      <template v-if="loadError" #actions><UButton color="error" variant="soft" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <UAlert v-if="notice" :description="notice" color="info" />
    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2"><USkeleton v-for="item in 2" :key="item" class="h-56 rounded-2xl" /></div>
    <EmptyState v-else-if="!loadError && !filtered.length" icon="i-lucide-building-2" :title="search.trim() ? 'Ничего не найдено' : 'Клиентов нет'" :description="search.trim() ? 'Измените запрос.' : 'Добавьте первую компанию.'" />
    <div v-else-if="filtered.length" class="grid gap-4 md:grid-cols-2">
      <article v-for="client in filtered" :key="client.id" class="surface catalog-card">
        <header class="catalog-card__header">
          <span class="catalog-card__icon"><UIcon name="i-lucide-building-2" class="size-6" /></span>
          <div class="catalog-card__content"><h2 class="break-words text-lg font-semibold">{{ client.name }}</h2><StatusBadge :tone="client.status === 'active' ? 'success' : 'warning'" :label="client.status === 'active' ? 'Активен' : 'Заблокирован'" class="self-start" /></div>
        </header>
        <div class="catalog-card__body space-y-2 text-sm">
          <p class="text-[var(--color-muted)]">{{ client.timezone }} · {{ new Date(client.createdAt).toLocaleDateString('ru-RU') }}</p>
          <div v-for="admin in client.administrators" :key="admin.id" class="min-w-0"><strong>{{ admin.name }}</strong><p class="break-all text-[var(--color-muted)]">{{ admin.email }}<span v-if="admin.status === 'invited'"> · Приглашён</span></p></div>
        </div>
        <footer class="catalog-card__footer">
          <UButton color="neutral" variant="soft" @click="enter(client)">Открыть CRM</UButton>
          <UDropdownMenu :items="actions(client)" :content="{ align: 'end' }" :modal="false"><UButton icon="i-lucide-ellipsis-vertical" aria-label="Действия клиента" color="neutral" variant="ghost" class="size-11" /></UDropdownMenu>
        </footer>
      </article>
    </div>
    <USlideover v-model:open="open" :title="title" :modal="true" :overlay="true">
      <template #body>
        <form id="client-form" class="space-y-5" @submit.prevent="save">
          <template v-if="kind !== 'invite'">
            <UFormField label="Компания"><UInput v-model="form.name" class="w-full" required minlength="2" maxlength="200" /></UFormField>
            <UFormField label="Часовой пояс"><UInput v-model="form.timezone" class="w-full" required /></UFormField>
          </template>
          <template v-if="kind !== 'edit'">
            <UFormField label="Имя администратора"><UInput v-model="form.administratorName" class="w-full" required minlength="2" maxlength="200" /></UFormField>
            <UFormField label="Email"><UInput v-model="form.email" type="email" class="w-full" required /></UFormField>
          </template>
          <UAlert v-if="error" color="error" :description="error" />
        </form>
      </template>
      <template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton type="submit" form="client-form" :loading="pending">Сохранить</UButton></div></template>
    </USlideover>
    <ConfirmActionModal v-model:open="blockOpen" title="Заблокировать клиента?" :description="`Доступ пользователей ${blockClient?.name ?? ''} и фоновые операции будут остановлены. Данные сохранятся.`" confirm-label="Заблокировать" :loading="pending" :error="error" @confirm="blockClient && setStatus(blockClient, 'blocked')" />
  </section>
</template>
