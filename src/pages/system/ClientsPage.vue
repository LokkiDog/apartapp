<script setup lang="ts">
import { switchClientContext, useCurrentUser } from '#fsd/shared/auth'
import { ConfirmActionModal, PageHeader, EmptyState } from '#fsd/shared/ui'
import type { PlatformClient } from '@contracts/platform'
import type { MessagingSetupRequest } from '@contracts/system-notifications'
import type { DropdownMenuItem } from '@nuxt/ui'
import ClientRegistryRow from './ClientRegistryRow.vue'
const user = useCurrentUser()
const { data: clients, refresh, status, error: loadError } = useAsyncData<PlatformClient[]>('system-clients', () => user.value?.isSuperuser ? $fetch<PlatformClient[]>('/api/system/clients') : Promise.resolve([]), {
  server: false,
  default: () => [],
  watch: [user],
})
const {
  data: setupRequests,
  refresh: refreshSetupRequests,
  error: setupRequestsError,
} = useAsyncData<MessagingSetupRequest[]>(
  'system-messaging-setup-requests',
  async (): Promise<MessagingSetupRequest[]> => {
    if (!user.value?.isSuperuser) return []
    return $fetch<MessagingSetupRequest[]>('/api/system/messaging-setup-requests')
  },
  { server: false, default: () => [], watch: [user] }
)
const readingRequestId = ref<string | null>(null)
const toast = useToast()
async function readSetupRequest(id: string) {
  if (readingRequestId.value) return
  readingRequestId.value = id
  try {
    await $fetch(`/api/system/messaging-setup-requests/${id}/read`, { method: 'POST' })
    await Promise.all([refreshSetupRequests(), refreshNuxtData(['system-notifications', 'system-notifications-unread'])])
  } catch {
    toast.add({ color: 'error', title: 'Не удалось отметить заявку прочитанной' })
  } finally {
    readingRequestId.value = null
  }
}
const search = ref('')
const statusFilter = ref<'all' | PlatformClient['status']>('all')
const statusOptions = [
  { label: 'Все статусы', value: 'all' },
  { label: 'Активные', value: 'active' },
  { label: 'Заблокированные', value: 'blocked' }
]
const query = computed(() => search.value.trim().toLowerCase())
const hasFilters = computed(() => Boolean(query.value) || statusFilter.value !== 'all')
const filtered = computed(() => clients.value.filter(client =>
  (statusFilter.value === 'all' || client.status === statusFilter.value) &&
  (client.name.toLowerCase().includes(query.value) ||
    client.administrators.some(admin => admin.email.toLowerCase().includes(query.value)))
))
const companyCount = new Intl.PluralRules('ru')
const companyLabels = { one: 'компания', few: 'компании', many: 'компаний', other: 'компаний', zero: 'компаний', two: 'компании' }
const countLabel = computed(() => {
  const count = clients.value.length
  return `${count} ${companyLabels[companyCount.select(count)]}`
})
function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}
const open = ref(false); const pending = ref(false); const error = ref(''); const notice = ref('')
const enteringClientId = ref<string | null>(null)
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
    if (kind.value === 'create') result = await $fetch<{ invitationSent?: boolean }>('/api/system/clients', { method: 'POST', body: form })
    else if (kind.value === 'edit') result = await $fetch<{ invitationSent?: boolean }>(`/api/system/clients/${selected.value!.id}`, { method: 'PATCH', body: { name: form.name, timezone: form.timezone } })
    else result = await $fetch<{ invitationSent?: boolean }>(`/api/system/clients/${selected.value!.id}/administrators`, { method: 'POST', body: { name: form.administratorName, email: form.email } })
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
async function setMessaging(client: PlatformClient, enabled: boolean) {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/system/clients/${client.id}`, { method: 'PATCH', body: { messagingEnabled: enabled } }); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось изменить доступ к сообщениям' }
  finally { pending.value = false }
}
async function resend(client: PlatformClient, administratorId: string) {
  error.value = ''; notice.value = ''
  try { await $fetch(`/api/system/clients/${client.id}/resend-invitation`, { method: 'POST', body: { userId: administratorId } }); notice.value = 'Приглашение отправлено' }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось отправить письмо' }
}
async function enter(organizationId: string) {
  if (enteringClientId.value) return
  enteringClientId.value = organizationId
  error.value = ''
  try { await switchClientContext(organizationId) }
  catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? 'Не удалось открыть клиента'
    enteringClientId.value = null
  }
}
function actions(client: PlatformClient): DropdownMenuItem[] {
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
  <section class="space-y-4 sm:space-y-5">
    <PageHeader title="Клиенты" :description="status === 'success' || clients.length ? countLabel : undefined">
      <template #actions>
        <UButton icon="i-lucide-plus" aria-label="Добавить клиента" @click="edit(null, 'create')">
          <span class="sm:hidden">Добавить</span>
          <span class="hidden sm:inline">Добавить клиента</span>
        </UButton>
      </template>
    </PageHeader>

    <UAlert v-if="setupRequestsError" description="Не удалось загрузить заявки на подключение" color="error" orientation="horizontal" role="alert">
      <template #actions><UButton color="error" variant="ghost" @click="refreshSetupRequests()">Повторить</UButton></template>
    </UAlert>
    <section v-if="setupRequests.length" class="surface px-3 sm:px-4" aria-labelledby="messaging-setup-requests">
      <header class="flex items-center gap-2 py-3">
        <h2 id="messaging-setup-requests" class="text-sm font-semibold sm:text-base">Заявки на подключение</h2>
        <UBadge color="primary" variant="soft" class="tabular-nums">{{ setupRequests.length }}</UBadge>
      </header>
      <ul class="divide-y divide-[var(--color-line)]">
        <li v-for="request in setupRequests" :key="request.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-[var(--color-line)] py-2 first:border-t">
          <div class="flex min-w-0 flex-[1_1_18rem] items-start gap-2.5">
            <span class="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)] sm:flex">
              <UIcon name="i-lucide-building-2" class="size-4" />
            </span>
            <div class="min-w-0 wrap-anywhere">
              <p class="text-sm font-semibold">{{ request.title }}</p>
              <p class="text-sm text-[var(--color-muted)]">{{ request.body }}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1 sm:gap-2">
            <UButton
              color="primary"
              variant="ghost"
              :loading="enteringClientId === request.organizationId"
              :disabled="enteringClientId !== null || !request.organizationId"
              @click="request.organizationId && enter(request.organizationId)"
            >Открыть CRM</UButton>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-check"
              aria-label="Отметить заявку прочитанной"
              :loading="readingRequestId === request.id"
              :disabled="readingRequestId !== null"
              @click="readSetupRequest(request.id)"
            >Прочитано</UButton>
          </div>
        </li>
      </ul>
    </section>

    <div class="flex flex-wrap items-center gap-2.5">
      <UInput v-model="search" aria-label="Поиск по компании или email" placeholder="Компания или email" icon="i-lucide-search" class="min-w-0 flex-[1_1_8rem] sm:max-w-sm" />
      <USelect v-model="statusFilter" :items="statusOptions" aria-label="Статус клиента" class="w-auto min-w-36 max-w-full" />
    </div>
    <UAlert v-if="loadError || (error && !open && !blockOpen)" color="error" orientation="horizontal" role="alert" :description="error || 'Не удалось загрузить клиентов'">
      <template v-if="loadError" #actions><UButton color="error" variant="ghost" @click="refresh()">Повторить</UButton></template>
    </UAlert>
    <UAlert v-if="notice" :description="notice" color="info" />
    <div v-if="status !== 'error' && (!user || status === 'idle' || (status === 'pending' && !clients.length))" class="space-y-2" aria-label="Загрузка клиентов">
      <USkeleton v-for="item in 3" :key="item" class="h-16 rounded-xl" />
    </div>
    <EmptyState
      v-else-if="status === 'success' && !filtered.length"
      icon="i-lucide-building-2"
      :title="hasFilters ? 'Ничего не найдено' : 'Клиентов нет'"
      :description="hasFilters ? 'Измените запрос или статус.' : 'Добавьте первую компанию.'"
    >
      <template v-if="hasFilters" #actions><UButton color="neutral" variant="soft" @click="clearFilters">Сбросить фильтры</UButton></template>
    </EmptyState>
    <div v-else-if="filtered.length" class="surface overflow-hidden" :aria-busy="status === 'pending'">
      <table class="hidden w-full table-fixed text-start text-sm lg:table">
        <caption class="sr-only">Реестр клиентов</caption>
        <colgroup><col><col><col class="w-36"><col class="w-36"><col class="w-52"></colgroup>
        <thead class="bg-[var(--color-surface-muted)] text-[var(--color-muted)]">
          <tr>
            <th scope="col" class="px-4 py-2.5 text-start font-semibold">Компания</th>
            <th scope="col" class="px-3 py-2.5 text-start font-semibold">Администратор</th>
            <th scope="col" class="px-3 py-2.5 text-start font-semibold">Статус</th>
            <th scope="col" class="px-3 py-2.5 text-start font-semibold">Сообщения</th>
            <th scope="col"><span class="sr-only">Действия</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-line)]">
          <ClientRegistryRow
            v-for="client in filtered"
            :key="client.id"
            layout="table"
            :client="client"
            :actions="actions(client)"
            :pending="pending"
            :entering-client-id="enteringClientId"
            @enter="enter(client.id)"
            @update:messaging="setMessaging(client, $event)"
          />
        </tbody>
      </table>
      <ul aria-label="Реестр клиентов" class="divide-y divide-[var(--color-line)] lg:hidden">
        <ClientRegistryRow
          v-for="client in filtered"
          :key="client.id"
          layout="list"
          :client="client"
          :actions="actions(client)"
          :pending="pending"
          :entering-client-id="enteringClientId"
          @enter="enter(client.id)"
          @update:messaging="setMessaging(client, $event)"
        />
      </ul>
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
          <UAlert v-if="error" color="error" role="alert" :description="error" />
        </form>
      </template>
      <template #footer><div class="form-actions form-actions--footer"><UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton type="submit" form="client-form" :loading="pending">Сохранить</UButton></div></template>
    </USlideover>
    <ConfirmActionModal v-model:open="blockOpen" title="Заблокировать клиента?" :description="`Доступ пользователей ${blockClient?.name ?? ''} и фоновые операции будут остановлены. Данные сохранятся.`" confirm-label="Заблокировать" :loading="pending" :error="error" @confirm="blockClient && setStatus(blockClient, 'blocked')" />
  </section>
</template>
