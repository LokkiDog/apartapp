<script setup lang="ts">
import Decimal from 'decimal.js'
import { createFormValidator, formatEuro, useSubmitFormValidation } from '#fsd/shared/lib'
import { MoneyInput, PageHeader, EmptyState, DeleteConfirmModal } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'
import { useI18n } from 'vue-i18n'
import { apartmentTypeInputSchema } from '@contracts/crm'

const currentUser = useCurrentUser()
const { t } = useI18n()
if (!currentUser.value?.roles.includes('administrator')) await navigateTo('/')
type Consumable = { id: string; name: string; category: string; unit: string }
type AutoWriteOff = { consumableId: string; quantity: number }
type ApartmentType = { id: string; name: string; ownerTotalEur: number; cleanerPoolEur: number; laundryEur: number; serviceEur: number; defaultChecklist: string[]; autoWriteOffs: AutoWriteOff[] }
const { data: types, refresh, status } = await useAsyncData('settings-apartment-types', () => currentUser.value ? $fetch<ApartmentType[]>('/api/apartment-types') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
const { data: consumables } = await useAsyncData('settings-auto-write-off-consumables', () => currentUser.value ? $fetch<Consumable[]>('/api/consumables') : Promise.resolve([]), { server: false, default: () => [], watch: [currentUser] })
const open = ref(false); const pending = ref(false); const error = ref('')
const deleteOpen = ref(false); const deletePending = ref(false); const typeToDelete = ref<ApartmentType | null>(null)
const typeToEdit = ref<ApartmentType | null>(null)
const form = reactive({ name: '', cleanerPoolEur: 0 as number | null, laundryEur: 0 as number | null, serviceEur: 0 as number | null, defaultChecklist: [] as string[], autoWriteOffs: [] as AutoWriteOff[] })
const validation = useSubmitFormValidation()
const validate = createFormValidator(apartmentTypeInputSchema, t)
const totalEur = computed(() => Number(new Decimal(form.cleanerPoolEur ?? 0).plus(form.laundryEur ?? 0).plus(form.serviceEur ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))
const checklistTemplate = computed(() => [t('common.checklistLinen'), t('common.checklistBathroom'), t('common.checklistSupplies')])
function resetForm() { Object.assign(form, { name: '', cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0, defaultChecklist: [...checklistTemplate.value], autoWriteOffs: [] }) }
function openCreate() { typeToEdit.value = null; resetForm(); validation.reset(); error.value = ''; open.value = true }
function openEdit(type: ApartmentType) { typeToEdit.value = type; Object.assign(form, { name: type.name, cleanerPoolEur: type.cleanerPoolEur, laundryEur: type.laundryEur, serviceEur: type.serviceEur, defaultChecklist: [...(type.defaultChecklist ?? checklistTemplate.value)], autoWriteOffs: (type.autoWriteOffs ?? []).map(rule => ({ ...rule, quantity: Number(rule.quantity) })) }); validation.reset(); error.value = ''; open.value = true }
async function save() { pending.value = true; error.value = ''; try { await $fetch(typeToEdit.value ? `/api/apartment-types/${typeToEdit.value.id}` : '/api/apartment-types', { method: typeToEdit.value ? 'PATCH' : 'POST', body: form }); open.value = false; typeToEdit.value = null; resetForm(); await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') } finally { pending.value = false } }
function askToDelete(type: ApartmentType) { typeToDelete.value = type; error.value = ''; deleteOpen.value = true }
function addChecklistItem() { form.defaultChecklist.push('') }
function removeChecklistItem(index: number) { form.defaultChecklist.splice(index, 1) }
function moveChecklistItem(index: number, direction: -1 | 1) { const next = index + direction; if (next < 0 || next >= form.defaultChecklist.length) return; const [item] = form.defaultChecklist.splice(index, 1); if (item !== undefined) form.defaultChecklist.splice(next, 0, item) }
function writeOffRule(consumableId: string) { return form.autoWriteOffs.find(rule => rule.consumableId === consumableId) }
function writeOffRuleIndex(consumableId: string) { return form.autoWriteOffs.findIndex(rule => rule.consumableId === consumableId) }
function setWriteOffEnabled(consumableId: string, enabled: boolean) { const existing = writeOffRule(consumableId); if (enabled && !existing) form.autoWriteOffs.push({ consumableId, quantity: 1 }); else if (!enabled && existing) form.autoWriteOffs.splice(form.autoWriteOffs.indexOf(existing), 1) }
async function removeType() { if (!typeToDelete.value) return; deletePending.value = true; error.value = ''; try { await $fetch(`/api/apartment-types/${typeToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; typeToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? t('common.error') } finally { deletePending.value = false } }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader :title="t('apartmentTypes.title')">
      <template #actions><UButton icon="i-lucide-plus" @click="openCreate">{{ t('apartmentTypes.add') }}</UButton></template>
    </PageHeader>

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2"><USkeleton v-for="item in 2" :key="item" class="h-48 rounded-2xl" /></div>
    <div v-else-if="types?.length" class="grid gap-4 md:grid-cols-2">
      <UCard v-for="type in types" :key="type.id">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">{{ type.name }}</h2>
            <div class="flex items-center gap-1"><span class="text-lg font-semibold tabular-nums">{{ formatEuro(type.ownerTotalEur) }}</span><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t('apartmentTypes.edit')" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click="openEdit(type)" /><UButton color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('apartmentTypes.removeItem')" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click="askToDelete(type)" /></div>
          </div>
        </template>
        <dl class="grid grid-cols-3 gap-3 text-sm"><div><dt class="text-[var(--color-muted)]">{{ t('apartmentTypes.cleaning') }}</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.cleanerPoolEur) }}</dd></div><div><dt class="text-[var(--color-muted)]">{{ t('apartmentTypes.laundry') }}</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.laundryEur) }}</dd></div><div><dt class="text-[var(--color-muted)]">{{ t('apartmentTypes.service') }}</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.serviceEur) }}</dd></div></dl>
        <div class="mt-5 border-t border-[var(--color-line)] pt-4"><p class="text-sm font-semibold">{{ t('apartmentTypes.checklist') }}</p><ul v-if="type.defaultChecklist?.length" class="mt-2 space-y-1 text-sm text-[var(--color-muted)]"><li v-for="(item, index) in type.defaultChecklist" :key="`${type.id}-${index}`" class="flex items-start gap-2"><span class="mt-1 text-[var(--color-primary)]">{{ index + 1 }}.</span><span>{{ item }}</span></li></ul><p v-else class="mt-2 text-sm text-[var(--color-muted)]">{{ t('apartmentTypes.noItems') }}</p></div>
        <div class="mt-5 border-t border-[var(--color-line)] pt-4"><p class="text-sm font-semibold">{{ t('apartmentTypes.autoWriteOff') }}</p><p class="mt-1 text-sm text-[var(--color-muted)]">{{ type.autoWriteOffs?.length ? type.autoWriteOffs.map(rule => `${consumables?.find(item => item.id === rule.consumableId)?.name ?? ''}: ${rule.quantity} ${consumables?.find(item => item.id === rule.consumableId)?.unit ?? ''}`).join(' · ') : t('apartmentTypes.autoWriteOffNone') }}</p></div>
      </UCard>
    </div>
    <EmptyState v-else icon="i-lucide-badge-euro" :title="t('apartmentTypes.emptyTitle')" :description="t('apartmentTypes.emptyDescription')" />

    <USlideover v-model:open="open" :title="typeToEdit ? t('apartmentTypes.edit') : t('apartmentTypes.new')" :modal="true" :overlay="true">
      <template #body>
        <UForm :key="validation.formKey.value" id="apartment-type-form" :state="form" :validate="validate" :validate-on="validation.validateOn.value" novalidate class="form-grid" @error="validation.onError" @submit="save">
          <UFormField name="name" :label="t('apartmentTypes.name')"><UInput v-model="form.name" placeholder="Studio" /></UFormField>
          <div class="rounded-xl bg-[var(--color-primary-soft)] px-4 py-3"><p class="text-sm text-[var(--color-muted)]">{{ t('apartmentTypes.total') }}</p><p class="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(totalEur) }}</p></div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3"><UFormField name="cleanerPoolEur" :label="t('apartmentTypes.cleaning')"><MoneyInput v-model="form.cleanerPoolEur" :empty-value="0" /></UFormField><UFormField name="laundryEur" :label="t('apartmentTypes.laundry')"><MoneyInput v-model="form.laundryEur" :empty-value="0" /></UFormField><UFormField name="serviceEur" :label="t('apartmentTypes.service')"><MoneyInput v-model="form.serviceEur" :empty-value="0" /></UFormField></div>
          <section><div class="mb-2 flex items-start justify-between gap-3"><div><p class="font-semibold">{{ t('common.checklist') }}</p><p class="text-sm text-[var(--color-muted)]">{{ t('common.checklistHint') }}</p></div><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="addChecklistItem">{{ t('common.add') }}</UButton></div><div class="space-y-2"><div v-for="(item, index) in form.defaultChecklist" :key="index" class="checklist-edit-row"><span class="grid size-8 shrink-0 place-items-center text-sm tabular-nums text-[var(--color-muted)]">{{ index + 1 }}</span><UFormField :name="`defaultChecklist.${index}`" class="min-w-0 flex-1"><UInput v-model="form.defaultChecklist[index]" class="w-full" :placeholder="t('common.action')" /></UFormField><div class="checklist-edit-actions"><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-up" :disabled="index === 0" :aria-label="t('common.action')" @click="moveChecklistItem(index, -1)" /><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-down" :disabled="index === form.defaultChecklist.length - 1" :aria-label="t('common.action')" @click="moveChecklistItem(index, 1)" /><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="t('common.removeItem')" @click="removeChecklistItem(index)" /></div></div></div></section>
          <p class="text-sm text-[var(--color-muted)]">{{ t('apartmentTypes.checklistNote') }}</p>
          <section class="border-t border-[var(--color-line)] pt-4"><div class="mb-2"><p class="font-semibold">{{ t('apartmentTypes.autoWriteOff') }}</p><p class="text-sm text-[var(--color-muted)]">{{ t('apartmentTypes.autoWriteOffHint') }}</p></div><div v-if="consumables?.length" class="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]"><div v-for="item in consumables" :key="item.id" class="flex min-h-14 items-center gap-3 px-3 py-2"><UCheckbox :model-value="Boolean(writeOffRule(item.id))" :label="item.name" class="min-w-0 flex-1" @update:model-value="setWriteOffEnabled(item.id, Boolean($event))" /><UFormField v-if="writeOffRule(item.id)" :name="`autoWriteOffs.${writeOffRuleIndex(item.id)}.quantity`" class="w-28"><UInput v-model.number="writeOffRule(item.id)!.quantity" type="number" min=".001" step=".001" class="w-full" :aria-label="`${item.name}: ${t('common.quantityPerCleaning')}`"><template #trailing>{{ item.unit }}</template></UInput></UFormField></div></div><p v-else class="text-sm text-[var(--color-muted)]">{{ t('apartmentTypes.autoWriteOffNoConsumables') }}</p></section>
          <UAlert v-if="error && !deleteOpen" color="error" variant="soft" :description="error" />
        </UForm>
      </template>
      <template #footer><div class="form-actions form-actions--footer"><UButton type="button" color="neutral" variant="ghost" @click="open = false">{{ t('common.cancel') }}</UButton><UButton type="submit" form="apartment-type-form" :loading="pending">{{ typeToEdit ? t('apartmentTypes.saveChanges') : t('apartmentTypes.create') }}</UButton></div></template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" :title="t('common.deleteForever')" :description="t('common.irreversible')" :loading="deletePending" :error="error" @confirm="removeType" />
  </section>
</template>
