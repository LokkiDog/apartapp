<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Apartment } from '#fsd/entities/apartment'
import { useCurrentUser } from '#fsd/shared/auth'
import { createFormValidator, formatDate, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { DateInput, DateRangeInput, DeleteConfirmModal, EmptyState, MoneyInput, PageHeader } from '#fsd/shared/ui'
import { useI18n } from 'vue-i18n'
import { expenseInputSchema } from '@contracts/expense'

type Expense = {
  id: string
  apartmentId: string
  apartmentName: string
  hotelName: string
  occurredOn: string
  amountEur: number
  description: string
  createdAt: string
}

const user = useCurrentUser()
const { t } = useI18n()
if (!user.value?.roles.includes('administrator')) await navigateTo('/')

function iso(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const today = new Date()
const from = ref(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
const to = ref(iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
const apartmentId = ref('all')
const open = ref(false)
const deleteOpen = ref(false)
const pending = ref(false)
const error = ref('')
const hydrated = ref(false)
const expenseToEdit = ref<Expense | null>(null)
const expenseToDelete = ref<Expense | null>(null)
const form = reactive({ apartmentId: '', occurredOn: iso(today), amountEur: 0, description: '' })
const validation = useSubmitFormValidation()
const validate = createFormValidator(expenseInputSchema, t)

onMounted(() => { hydrated.value = true })

const { data: apartments } = await useAsyncData('expenses-apartments', () => user.value ? $fetch<Apartment[]>('/api/apartments') : Promise.resolve([]), { server: false, default: () => [], watch: [user] })
const { data: expenses, status, refresh } = await useAsyncData('expenses', () => {
  if (!user.value?.roles.includes('administrator')) return Promise.resolve([] as Expense[])
  return $fetch<Expense[]>('/api/expenses', { query: { from: from.value, to: to.value, ...(apartmentId.value !== 'all' ? { apartmentId: apartmentId.value } : {}) } })
}, { server: false, default: () => [], watch: [user, from, to, apartmentId] })

const apartmentOptions = computed(() => [
  { label: t('expenses.allApartments'), value: 'all' },
  ...(apartments.value ?? []).map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))
])

function expenseMenuItems(expense: Expense): DropdownMenuItem[] {
  return [
    { label: t('expenses.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(expense) },
    { label: t('expenses.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askToDelete(expense) }
  ]
}

function resetForm() {
  Object.assign(form, { apartmentId: apartments.value?.[0]?.id ?? '', occurredOn: iso(new Date()), amountEur: 0, description: '' })
}
function openCreate() {
  error.value = ''
  expenseToEdit.value = null
  resetForm()
  validation.reset()
  open.value = true
}
function openEdit(expense: Expense) {
  error.value = ''
  expenseToEdit.value = expense
  Object.assign(form, { apartmentId: expense.apartmentId, occurredOn: expense.occurredOn, amountEur: Number(expense.amountEur), description: expense.description })
  validation.reset()
  open.value = true
}
function askToDelete(expense: Expense) {
  error.value = ''
  expenseToDelete.value = expense
  deleteOpen.value = true
}
async function save() {
  pending.value = true
  error.value = ''
  try {
    await $fetch(expenseToEdit.value ? `/api/expenses/${expenseToEdit.value.id}` : '/api/expenses', {
      method: expenseToEdit.value ? 'PATCH' : 'POST',
      body: { ...form }
    })
    open.value = false
    expenseToEdit.value = null
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
async function remove() {
  if (!expenseToDelete.value) return
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/expenses/${expenseToDelete.value.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    expenseToDelete.value = null
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage ?? t('common.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('expenses.title')">
      <template #actions><UButton icon="i-lucide-plus" @click="openCreate">{{ t('expenses.add') }}</UButton></template>
    </PageHeader>

    <div class="surface grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(14rem,1fr)] sm:p-5">
      <UFormField :label="t('expenses.period')"><DateRangeInput v-model:start="from" v-model:end="to" :start-label="t('reports.start')" :end-label="t('reports.end')" required /></UFormField>
      <UFormField :label="t('expenses.apartment')"><USelect v-model="apartmentId" :items="apartmentOptions" class="w-full" /></UFormField>
    </div>

    <UAlert v-if="hydrated && error && !open && !deleteOpen" color="error" variant="soft" :description="error" />
    <div v-if="!hydrated || status === 'pending'" class="grid gap-3"><USkeleton v-for="item in 4" :key="item" class="h-[72px] rounded-2xl" /></div>
    <div v-else-if="expenses?.length" class="surface divide-y divide-[var(--color-line)] px-3 sm:px-5">
      <article v-for="expense in expenses" :key="expense.id" class="flex min-h-[72px] cursor-pointer items-center gap-3 py-3 outline-none transition-[background-color] duration-150 focus-visible:bg-[var(--color-surface-muted)] sm:gap-4" role="button" tabindex="0" @click="openEdit(expense)" @keydown.enter="openEdit(expense)" @keydown.space.prevent="openEdit(expense)">
        <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UIcon name="i-lucide-receipt-euro" class="size-4" /></div>
        <div class="min-w-0 flex-1"><p class="truncate font-semibold leading-5">{{ expense.description }}</p><p class="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-[var(--color-muted)]"><span class="truncate">{{ expense.apartmentName }} · {{ expense.hotelName }}</span><span aria-hidden="true">·</span><time class="shrink-0">{{ formatDate(expense.occurredOn) }}</time></p></div>
        <strong class="shrink-0 whitespace-nowrap tabular-nums text-[var(--color-primary-strong)]">{{ formatEuro(expense.amountEur) }}</strong>
        <UDropdownMenu :items="expenseMenuItems(expense)" :content="{ align: 'end' }" :modal="false"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="t('expenses.actions')" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click.stop @keydown.stop /></UDropdownMenu>
      </article>
    </div>
    <EmptyState v-else icon="i-lucide-receipt-euro" :title="t('expenses.emptyTitle')" :description="t('expenses.emptyDescription')"><template #actions><UButton @click="openCreate">{{ t('expenses.add') }}</UButton></template></EmptyState>

    <USlideover v-model:open="open" :title="expenseToEdit ? t('expenses.edit') : t('expenses.new')">
      <template #body><UForm :key="validation.formKey.value" id="expense-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid" @error="validation.onError" @submit="save"><UFormField name="apartmentId" :label="t('expenses.apartment')"><USelect v-model="form.apartmentId" :items="(apartments ?? []).map(apartment => ({ label: `${apartment.name} · ${apartment.hotel.name}`, value: apartment.id }))" class="w-full" /></UFormField><UFormField name="occurredOn" :label="t('expenses.date')"><DateInput v-model="form.occurredOn" /></UFormField><UFormField name="amountEur" :label="t('expenses.amount')"><MoneyInput v-model="form.amountEur" /></UFormField><UFormField name="description" :label="t('expenses.description')" class="w-full"><UTextarea v-model="form.description" class="w-full" :rows="4" maxlength="200" placeholder="Mixer repair" /></UFormField><UAlert v-if="error" color="error" variant="soft" :description="error" /></UForm></template>
      <template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="open = false">{{ t('expenses.cancel') }}</UButton><UButton type="submit" form="expense-form" :loading="pending">{{ expenseToEdit ? t('expenses.save') : t('expenses.add') }}</UButton></div></template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('expenses.delete')" :description="t('expenses.deleteDescription')" :loading="pending" :error="error" @confirm="remove" />
  </section>
</template>
