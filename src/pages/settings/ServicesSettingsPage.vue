<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { createFormValidator, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { MoneyInput, PageHeader, EmptyState, StatusBadge, DeleteConfirmModal } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { useI18n } from 'vue-i18n'
import { specialServiceIconOptions, type SpecialServiceIconName } from '#shared/config/special-service-icons'
import ServiceIconPicker from './ui/ServiceIconPicker.vue'
import { specialServiceInputSchema } from '@contracts/crm'

const currentUser = useCurrentUser()
const { t } = useI18n()
if (!currentUser.value?.roles.includes('administrator')) await navigateTo('/')
type Service = { id: string; name: string; iconName: SpecialServiceIconName; priceEur: number; managerSharePercent: number; active: boolean }
const { data: services, refresh, status } = await useAsyncData('settings-services', () => currentUser.value ? $fetch<Service[]>('/api/special-services') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
const open = ref(false); const pending = ref(false); const error = ref('')
const serviceToEdit = ref<Service | null>(null); const serviceToDelete = ref<Service | null>(null); const deleteOpen = ref(false); const deletePending = ref(false)
const form = reactive({ name: '', iconName: specialServiceIconOptions[0].name, priceEur: 0 as number | null, managerSharePercent: 0, active: true })
const validation = useSubmitFormValidation()
const validate = createFormValidator(specialServiceInputSchema, t)
function resetForm() { Object.assign(form, { name: '', iconName: specialServiceIconOptions[0].name, priceEur: 0, managerSharePercent: 0, active: true }) }
function openCreate() { serviceToEdit.value = null; resetForm(); validation.reset(); error.value = ''; open.value = true }
function openEdit(service: Service) { serviceToEdit.value = service; Object.assign(form, service); validation.reset(); error.value = ''; open.value = true }
async function save() { pending.value = true; error.value = ''; try { await $fetch(serviceToEdit.value ? `/api/special-services/${serviceToEdit.value.id}` : '/api/special-services', { method: serviceToEdit.value ? 'PATCH' : 'POST', body: form }); open.value = false; serviceToEdit.value = null; resetForm(); await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') } finally { pending.value = false } }
async function toggle(service: Service) { await $fetch(`/api/special-services/${service.id}`, { method: 'PATCH', body: { name: service.name, iconName: service.iconName, priceEur: service.priceEur, managerSharePercent: service.managerSharePercent, active: !service.active } }); await refresh() }
function askToDelete(service: Service) { serviceToDelete.value = service; error.value = ''; deleteOpen.value = true }
async function removeService() { if (!serviceToDelete.value) return; deletePending.value = true; error.value = ''; try { await $fetch(`/api/special-services/${serviceToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; serviceToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') } finally { deletePending.value = false } }
function serviceMenuItems(service: Service): DropdownMenuItem[][] { return [[{ label: service.active ? t('services.toggleOff') : t('services.toggleOn'), icon: service.active ? 'i-lucide-eye-off' : 'i-lucide-eye', onSelect: () => { void toggle(service) } }], [{ label: t('services.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(service) }, { label: t('services.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askToDelete(service) }]] }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('services.title')"><template #actions><UButton icon="i-lucide-plus" @click="openCreate">{{ t('services.add') }}</UButton></template></PageHeader>
    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2"><USkeleton v-for="item in 4" :key="item" class="h-56 rounded-2xl" /></div>
    <div v-else-if="services?.length" class="grid gap-4 md:grid-cols-2">
      <article v-for="service in services" :key="service.id" class="surface service-card">
        <div class="service-card__header"><div class="service-card__icon"><UIcon :name="service.iconName" class="size-5" /></div><div class="service-card__content"><div class="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5"><h2 class="min-w-0 flex-1 truncate text-xl font-semibold leading-tight">{{ service.name }}</h2><StatusBadge class="shrink-0" :label="service.active ? t('services.active') : t('services.disabled')" :tone="service.active ? 'success' : 'neutral'" /></div><p class="m-0 text-sm leading-5 text-[var(--color-muted)]">{{ t('services.managerShare') }} — {{ service.managerSharePercent }}%</p></div></div>
        <div class="service-card__footer"><p class="service-card__price"><strong class="tabular-nums">{{ formatEuro(service.priceEur) }}</strong></p><div class="service-card__actions"><UDropdownMenu :items="serviceMenuItems(service)" :content="{ align: 'end' }"><UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical" :aria-label="t('services.actions')" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" /></UDropdownMenu></div></div>
      </article>
    </div>
    <EmptyState v-else icon="i-lucide-concierge-bell" :title="t('services.emptyTitle')" :description="t('services.emptyDescription')" />
    <USlideover v-model:open="open" :title="serviceToEdit ? t('services.edit') : t('services.new')"><template #body><UForm :key="validation.formKey.value" id="service-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid" @error="validation.onError" @submit="save"><UFormField name="name" :label="t('services.name')"><UInput v-model="form.name" placeholder="Late checkout" /></UFormField><UFormField name="iconName" :label="t('services.icon')"><ServiceIconPicker v-model="form.iconName" /></UFormField><UFormField name="priceEur" :label="t('services.price')"><MoneyInput v-model="form.priceEur" /></UFormField><UFormField name="managerSharePercent" :label="t('services.sharePercent')"><UInput v-model.number="form.managerSharePercent" type="number" min="0" max="100" /></UFormField><UCheckbox v-model="form.active" :label="t('services.available')" /><UAlert v-if="error && !deleteOpen" color="error" variant="soft" :description="error" /></UForm></template><template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="open = false">{{ t('services.cancel') }}</UButton><UButton type="submit" form="service-form" :loading="pending">{{ serviceToEdit ? t('services.saveChanges') : t('services.add') }}</UButton></div></template></USlideover><DeleteConfirmModal v-model:open="deleteOpen" :title="t('services.delete')" :description="t('common.irreversible')" :loading="deletePending" :error="error" @confirm="removeService" />
  </section>
</template>
