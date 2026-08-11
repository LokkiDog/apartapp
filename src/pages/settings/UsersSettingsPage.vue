<script setup lang="ts">
import { PageHeader, EmptyState } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'

const currentUser = useCurrentUser()
if (!currentUser.value?.roles.includes('administrator')) await navigateTo('/')

type Member = { id: string; name: string; email: string; roles: string[]; status: string }
const { data: users, refresh, status } = await useAsyncData('settings-users', () => $fetch<Member[]>('/api/users'))
const open = ref(false)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const showArchived = ref(false)
const archivePending = ref(false)
const deleteOpen = ref(false)
const deletePending = ref(false)
const memberToDelete = ref<Member | null>(null)
const confirmationName = ref('')
const form = reactive({ name: '', email: '', roles: ['manager'] as string[] })
const roleOptions = [{ label: 'Управляющий', value: 'manager' }, { label: 'Уборщица', value: 'cleaner' }, { label: 'Администратор', value: 'administrator' }]
const roleLabels: Record<string, string> = { administrator: 'Администратор', manager: 'Управляющий', cleaner: 'Уборщица' }
const visibleUsers = computed(() => (users.value ?? []).filter(member => showArchived.value ? member.status === 'archived' : member.status !== 'archived'))
const statusLabel = (status: string) => ({ active: 'Активен', invited: 'Приглашён', blocked: 'Заблокирован', archived: 'В архиве' }[status] ?? status)
const statusColor = (status: string) => ({ active: 'success', invited: 'warning', blocked: 'error', archived: 'neutral' }[status] ?? 'neutral') as 'success' | 'warning' | 'error' | 'neutral'

async function invite() {
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await $fetch('/api/users/invite', { method: 'POST', body: form })
    notice.value = 'Приглашение отправлено'
    Object.assign(form, { name: '', email: '', roles: ['manager'] })
    open.value = false
    await refresh()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось отправить приглашение' }
  finally { pending.value = false }
}
async function archive(member: Member) {
  archivePending.value = true; error.value = ''; notice.value = ''
  try { await $fetch(`/api/users/${member.id}/archive`, { method: 'POST' }); notice.value = `Пользователь «${member.name}» перемещён в архив`; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось архивировать пользователя' }
  finally { archivePending.value = false }
}
function askToDelete(member: Member) { memberToDelete.value = member; confirmationName.value = ''; error.value = ''; deleteOpen.value = true }
async function deletePermanently() {
  if (!memberToDelete.value) return
  deletePending.value = true; error.value = ''
  try { await $fetch(`/api/users/${memberToDelete.value.id}`, { method: 'DELETE', body: { confirmationName: confirmationName.value } }); deleteOpen.value = false; notice.value = `Пользователь «${memberToDelete.value.name}» удалён навсегда`; memberToDelete.value = null; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось удалить пользователя' }
  finally { deletePending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Пользователи" description="Команда, роли и доступ к Aparts CRM."><template #actions><UButton color="neutral" variant="ghost" icon="i-lucide-archive" @click="showArchived = !showArchived">{{ showArchived ? 'Текущие' : 'Архив' }}</UButton><UButton icon="i-lucide-user-plus" @click="open = true">Пригласить</UButton></template></PageHeader>
    <UAlert v-if="notice" color="success" variant="soft" :description="notice" icon="i-lucide-circle-check" />
    <UAlert v-if="error && !deleteOpen" color="error" variant="soft" :description="error" />
    <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 3" :key="item" class="h-20 rounded-2xl" /></div>
    <div v-else-if="visibleUsers.length" class="surface divide-y divide-[var(--color-line)] px-5 sm:px-6">
      <div v-for="member in visibleUsers" :key="member.id" class="flex min-h-20 items-center gap-4 py-4">
        <UAvatar :alt="member.name" :text="member.name.slice(0, 2).toUpperCase()" size="lg" />
        <div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ member.name }}</p><p class="truncate text-sm text-[var(--color-muted)]">{{ member.email }}</p></div>
        <div class="hidden flex-wrap justify-end gap-1 sm:flex"><UBadge v-for="role in member.roles" :key="role" color="neutral" variant="soft">{{ roleLabels[role] ?? role }}</UBadge></div>
        <UBadge :color="statusColor(member.status)" variant="soft">{{ statusLabel(member.status) }}</UBadge>
        <div v-if="member.id !== currentUser?.id" class="flex shrink-0 items-center gap-1"><UButton v-if="member.status !== 'archived'" color="neutral" variant="ghost" icon="i-lucide-archive" aria-label="Архивировать пользователя" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" :loading="archivePending" @click="archive(member)" /><UButton v-else color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить пользователя навсегда" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click="askToDelete(member)" /></div>
      </div>
    </div>
    <EmptyState v-else icon="i-lucide-users" :title="showArchived ? 'Архив пуст' : 'Пользователей пока нет'" :description="showArchived ? 'Здесь появятся архивированные пользователи.' : 'Пригласите управляющего или уборщицу, чтобы назначать объекты и работы.'" />
    <USlideover v-model:open="open" title="Новый пользователь"><template #body><form class="form-grid" @submit.prevent="invite"><UFormField label="Имя"><UInput v-model="form.name" required /></UFormField><UFormField label="Email" help="На этот адрес придёт ссылка для создания пароля."><UInput v-model="form.email" type="email" required /></UFormField><UFormField label="Роли"><USelect v-model="form.roles" :items="roleOptions" multiple class="w-full" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton type="submit" :loading="pending">Отправить приглашение</UButton></div></form></template></USlideover>
    <UModal v-model:open="deleteOpen" title="Удалить пользователя навсегда"><template #body><div class="space-y-5"><UAlert color="error" variant="soft" title="Это действие нельзя отменить." :description="`Будут удалены назначения, созданные пользователем работы, заезды, уведомления, файлы и связанные финансовые записи. Апартаменты останутся без управляющего.`" /><p>Для подтверждения введите имя: <strong>{{ memberToDelete?.name }}</strong></p><UInput v-model="confirmationName" class="w-full" :placeholder="memberToDelete?.name" /><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="deleteOpen = false">Отмена</UButton><UButton color="error" :loading="deletePending" :disabled="confirmationName !== memberToDelete?.name" @click="deletePermanently">Удалить навсегда</UButton></div></div></template></UModal>
  </section>
</template>
