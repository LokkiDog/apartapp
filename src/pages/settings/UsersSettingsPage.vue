<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { PageHeader, EmptyState } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { useI18n } from 'vue-i18n'

const currentUser = useCurrentUser()
const { t } = useI18n()
if (!currentUser.value?.roles.includes('administrator')) await navigateTo('/')

type Member = { id: string; name: string; email: string; roles: string[]; status: string; isVika: boolean; invitationResendAvailableAt: string | null }
const { data: users, refresh, status } = await useAsyncData('settings-users', () => currentUser.value ? $fetch<Member[]>('/api/users') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
const open = ref(false)
const pending = ref(false)
const error = ref('')
const notice = ref('')
const showArchived = ref(false)
const search = ref('')
const archivePending = ref(false)
const restorePendingId = ref<string | null>(null)
const vikaPendingId = ref<string | null>(null)
const resendPendingId = ref<string | null>(null)
const countdownNow = ref(Date.now())
const deleteOpen = ref(false)
const deletePending = ref(false)
const memberToDelete = ref<Member | null>(null)
const confirmationName = ref('')
const form = reactive({ name: '', email: '', roles: ['manager'] as string[], locale: 'ru' as 'ru' | 'en' | 'he' })
const roleOptions = computed(() => [{ label: t('roles.manager'), value: 'manager' }, { label: t('roles.cleaner'), value: 'cleaner' }, { label: t('roles.specialist'), value: 'specialist' }, { label: t('roles.administrator'), value: 'administrator' }])
const localeOptions = [{ label: 'Русский', value: 'ru' }, { label: 'English', value: 'en' }, { label: 'עברית', value: 'he' }]
const roleLabels = computed<Record<string, string>>(() => ({ administrator: t('roles.administrator'), manager: t('roles.manager'), cleaner: t('roles.cleaner'), specialist: t('roles.specialist') }))
const visibleUsers = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()

  return (users.value ?? []).filter((member) => {
    const matchesStatus = showArchived.value ? member.status === 'archived' : member.status !== 'archived'
    const matchesSearch = !query || [member.name, member.email].some(value => value.toLocaleLowerCase().includes(query))
    return matchesStatus && matchesSearch
  })
})
const statusLabel = (status: string) => ({ active: t('users.active'), invited: t('users.invited'), blocked: t('users.blocked'), archived: t('users.archived') }[status] ?? status)
const statusColor = (status: string) => ({ active: 'success', invited: 'warning', blocked: 'error', archived: 'neutral' }[status] ?? 'neutral') as 'success' | 'warning' | 'error' | 'neutral'
const canBeVika = (member: Member) => member.status !== 'archived' && (member.roles.includes('manager') || member.roles.includes('administrator'))
const mobileRoleLabel = (member: Member) => member.roles[0] ? roleLabels.value[member.roles[0]] ?? member.roles[0] : ''
let countdownTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => { countdownTimer = setInterval(() => { countdownNow.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (countdownTimer) clearInterval(countdownTimer) })

function resendWait(member: Member) {
  if (!member.invitationResendAvailableAt) return 0
  return Math.max(0, Math.ceil((Date.parse(member.invitationResendAvailableAt) - countdownNow.value) / 1000))
}

function resendLabel(member: Member) {
  const seconds = resendWait(member)
  return seconds ? t('users.resendInviteIn', { seconds }) : t('users.resendInvite')
}

function userMenuItems(member: Member): DropdownMenuItem[][] {
  if (member.status === 'archived') {
    return [[
      { label: t('users.restoreAction'), icon: 'i-lucide-archive-restore', disabled: restorePendingId.value !== null, onSelect: () => { void restore(member) } },
      { label: t('users.deleteAction'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askToDelete(member) }
    ]]
  }

  const items: DropdownMenuItem[] = []
  if (member.status === 'invited' && member.id !== currentUser.value?.id) {
    items.push({ label: resendLabel(member), icon: resendWait(member) ? 'i-lucide-clock-3' : 'i-lucide-send', disabled: resendWait(member) > 0 || resendPendingId.value === member.id, onSelect: () => { void resendInvite(member) } })
  }
  if (member.id !== currentUser.value?.id) {
    items.push({ label: t('users.archiveAction'), icon: 'i-lucide-archive', disabled: archivePending.value, onSelect: () => { void archive(member) } })
  }
  if (canBeVika(member)) {
    items.push({ label: t('users.vikaAccount'), icon: 'i-lucide-star', type: 'checkbox', checked: member.isVika, disabled: vikaPendingId.value !== null, onSelect: () => { void setVika(member, !member.isVika) } })
  }
  return items.length ? [items] : []
}

async function invite() {
  pending.value = true; error.value = ''; notice.value = ''
  try {
    await $fetch('/api/users/invite', { method: 'POST', body: form })
    notice.value = t('users.inviteSent')
    Object.assign(form, { name: '', email: '', roles: ['manager'], locale: 'ru' })
    open.value = false
    await refresh()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { pending.value = false }
}
async function archive(member: Member) {
  archivePending.value = true; error.value = ''; notice.value = ''
  try { await $fetch(`/api/users/${member.id}/archive`, { method: 'POST' }); notice.value = t('users.archiveAction'); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { archivePending.value = false }
}
async function restore(member: Member) {
  restorePendingId.value = member.id; error.value = ''; notice.value = ''
  try { await $fetch(`/api/users/${member.id}/restore`, { method: 'POST' }); notice.value = t('users.restoreAction'); await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { restorePendingId.value = null }
}
async function setVika(member: Member, isVika: boolean) {
  vikaPendingId.value = member.id; error.value = ''; notice.value = ''
  try {
    await $fetch(`/api/users/${member.id}/vika`, { method: 'PATCH', body: { isVika } })
    notice.value = t(isVika ? 'users.vikaAssigned' : 'users.vikaRemoved')
    await refresh()
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { vikaPendingId.value = null }
}
async function resendInvite(member: Member) {
  resendPendingId.value = member.id; error.value = ''; notice.value = ''
  try {
    const result = await $fetch<{ invitationResendAvailableAt: string }>(`/api/users/${member.id}/resend-invitation`, { method: 'POST' })
    member.invitationResendAvailableAt = result.invitationResendAvailableAt
    countdownNow.value = Date.now()
    notice.value = t('users.inviteResent')
  } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { resendPendingId.value = null }
}
function askToDelete(member: Member) { memberToDelete.value = member; confirmationName.value = ''; error.value = ''; deleteOpen.value = true }
async function deletePermanently() {
  if (!memberToDelete.value) return
  deletePending.value = true; error.value = ''
  try { await $fetch(`/api/users/${memberToDelete.value.id}`, { method: 'DELETE', body: { confirmationName: confirmationName.value } }); deleteOpen.value = false; notice.value = t('users.deleteAction'); memberToDelete.value = null; await refresh() }
  catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') }
  finally { deletePending.value = false }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('users.title')"><template #actions><UButton color="neutral" variant="ghost" icon="i-lucide-archive" @click="showArchived = !showArchived">{{ showArchived ? t('users.current') : t('users.archive') }}</UButton><UButton icon="i-lucide-user-plus" @click="open = true">{{ t('users.invite') }}</UButton></template></PageHeader>
    <UAlert v-if="notice" color="success" variant="soft" :description="notice" icon="i-lucide-circle-check" />
    <UAlert v-if="error && !deleteOpen" color="error" variant="soft" :description="error" />
    <UInput v-if="status !== 'pending' && users.length" v-model="search" icon="i-lucide-search" :placeholder="t('users.search')" :aria-label="t('users.search')" class="w-full sm:max-w-sm" />
    <div v-if="status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 3" :key="item" class="h-20 rounded-2xl" /></div>
    <div v-else-if="visibleUsers.length" class="user-list surface px-3 sm:px-6">
      <div v-for="member in visibleUsers" :key="member.id" class="user-list-row">
        <div class="user-list-row__identity"><div class="user-list-row__name"><p class="user-list-row__name-text truncate font-semibold">{{ member.name }}<span v-if="member.isVika" class="user-list-row__vika-marker" role="img" :aria-label="t('users.vikaAccount')"><span aria-hidden="true">·</span><strong aria-hidden="true" class="user-list-row__vika-letter">В</strong></span></p></div><p class="truncate text-sm text-[var(--color-muted)]">{{ member.email }}</p></div>
        <div class="user-list-row__roles"><UBadge v-for="role in member.roles" :key="role" color="neutral" variant="soft" class="user-list-row__role user-list-row__role--desktop">{{ roleLabels[role] ?? role }}</UBadge><UBadge v-if="mobileRoleLabel(member)" color="neutral" variant="soft" class="user-list-row__role user-list-row__role--mobile" :title="mobileRoleLabel(member)">{{ mobileRoleLabel(member) }}</UBadge><UBadge v-if="member.roles.length > 1" color="neutral" variant="soft" class="user-list-row__role user-list-row__role--mobile">+{{ member.roles.length - 1 }}</UBadge></div>
        <div class="user-list-row__status"><span class="user-list-row__status-dot" :data-tone="statusColor(member.status)" role="img" :aria-label="statusLabel(member.status)" /><UBadge :color="statusColor(member.status)" variant="soft" class="user-list-row__status-badge">{{ statusLabel(member.status) }}</UBadge></div>
        <UDropdownMenu v-if="userMenuItems(member).length" :items="userMenuItems(member)" :content="{ align: 'end' }" :modal="false"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="`${t('users.title')}: ${member.name}`" class="user-list-row__menu-button min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu>
      </div>
    </div>
    <EmptyState v-else icon="i-lucide-users" :title="showArchived ? t('users.emptyArchive') : t('users.emptyTitle')" :description="showArchived ? t('users.emptyArchiveDescription') : t('users.emptyDescription')" />
    <USlideover v-model:open="open" :title="t('users.new')" :modal="true" :overlay="true"><template #body><form id="user-invite-form" class="form-grid" @submit.prevent="invite"><UFormField :label="t('users.name')"><UInput v-model="form.name" required /></UFormField><UFormField label="Email" :help="t('users.emailHelp')"><UInput v-model="form.email" type="email" required /></UFormField><UFormField :label="t('users.roles')"><USelect :model-value="form.roles[0]" :items="roleOptions" class="w-full" @update:model-value="value => form.roles = [String(value)]" /></UFormField><UFormField :label="t('users.inviteLanguage')"><USelect v-model="form.locale" :items="localeOptions" class="w-full" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></form></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="open = false">{{ t('users.cancel') }}</UButton><UButton type="submit" form="user-invite-form" :loading="pending">{{ t('users.sendInvite') }}</UButton></div></template></USlideover>
    <UModal v-model:open="deleteOpen" :title="t('users.deleteAction')"><template #body><div class="space-y-5"><UAlert color="error" variant="soft" :title="t('common.irreversible')" /><p>{{ t('users.name') }}: <strong>{{ memberToDelete?.name }}</strong></p><UInput v-model="confirmationName" class="w-full" :placeholder="memberToDelete?.name" /><UAlert v-if="error" color="error" variant="soft" :description="error" /><div class="form-actions"><UButton color="neutral" variant="ghost" @click="deleteOpen = false">{{ t('users.cancel') }}</UButton><UButton color="error" :loading="deletePending" :disabled="confirmationName !== memberToDelete?.name" @click="deletePermanently">{{ t('common.delete') }}</UButton></div></div></template></UModal>
  </section>
</template>
