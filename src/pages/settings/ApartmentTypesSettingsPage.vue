<script setup lang="ts">
import Decimal from 'decimal.js'
import { formatEuro } from '#fsd/shared/lib'
import { MoneyInput, PageHeader, EmptyState, DeleteConfirmModal } from '#fsd/shared/ui'
import { useCurrentUser } from '#fsd/shared/auth'

const currentUser = useCurrentUser()
if (!currentUser.value?.roles.includes('administrator')) await navigateTo('/')
type ApartmentType = { id: string; name: string; ownerTotalEur: number; cleanerPoolEur: number; laundryEur: number; serviceEur: number; defaultChecklist: string[] }
const { data: types, refresh, status } = await useAsyncData('settings-apartment-types', () => $fetch<ApartmentType[]>('/api/apartment-types'))
const open = ref(false); const pending = ref(false); const error = ref('')
const deleteOpen = ref(false); const deletePending = ref(false); const typeToDelete = ref<ApartmentType | null>(null)
const typeToEdit = ref<ApartmentType | null>(null)
const form = reactive({ name: '', cleanerPoolEur: 0 as number | null, laundryEur: 0 as number | null, serviceEur: 0 as number | null, defaultChecklist: [] as string[] })
const totalEur = computed(() => Number(new Decimal(form.cleanerPoolEur ?? 0).plus(form.laundryEur ?? 0).plus(form.serviceEur ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)))
const checklistTemplate = ['Сменить белье и полотенца', 'Проверить санузел и кухню', 'Проверить расходники']
function resetForm() { Object.assign(form, { name: '', cleanerPoolEur: 0, laundryEur: 0, serviceEur: 0, defaultChecklist: [...checklistTemplate] }) }
function openCreate() { typeToEdit.value = null; resetForm(); error.value = ''; open.value = true }
function openEdit(type: ApartmentType) { typeToEdit.value = type; Object.assign(form, { name: type.name, cleanerPoolEur: type.cleanerPoolEur, laundryEur: type.laundryEur, serviceEur: type.serviceEur, defaultChecklist: [...(type.defaultChecklist ?? checklistTemplate)] }); error.value = ''; open.value = true }
async function save() { pending.value = true; error.value = ''; try { await $fetch(typeToEdit.value ? `/api/apartment-types/${typeToEdit.value.id}` : '/api/apartment-types', { method: typeToEdit.value ? 'PATCH' : 'POST', body: form }); open.value = false; typeToEdit.value = null; resetForm(); await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? (typeToEdit.value ? 'Не удалось изменить тип' : 'Не удалось создать тип') } finally { pending.value = false } }
function askToDelete(type: ApartmentType) { typeToDelete.value = type; error.value = ''; deleteOpen.value = true }
function addChecklistItem() { form.defaultChecklist.push('') }
function removeChecklistItem(index: number) { form.defaultChecklist.splice(index, 1) }
function moveChecklistItem(index: number, direction: -1 | 1) { const next = index + direction; if (next < 0 || next >= form.defaultChecklist.length) return; const [item] = form.defaultChecklist.splice(index, 1); if (item !== undefined) form.defaultChecklist.splice(next, 0, item) }
async function removeType() { if (!typeToDelete.value) return; deletePending.value = true; error.value = ''; try { await $fetch(`/api/apartment-types/${typeToDelete.value.id}`, { method: 'DELETE' }); deleteOpen.value = false; typeToDelete.value = null; await refresh() } catch (cause: any) { error.value = cause?.data?.statusMessage ?? 'Не удалось удалить тип' } finally { deletePending.value = false } }
</script>

<template>
  <section class="page-wrap space-y-6">
    <PageHeader title="Типы и тарифы" description="Пакетная стоимость уборки и стандартный чек-лист для каждого типа апартамента.">
      <template #actions><UButton icon="i-lucide-plus" @click="openCreate">Добавить тип</UButton></template>
    </PageHeader>

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2"><USkeleton v-for="item in 2" :key="item" class="h-48 rounded-2xl" /></div>
    <div v-else-if="types?.length" class="grid gap-4 md:grid-cols-2">
      <UCard v-for="type in types" :key="type.id">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold">{{ type.name }}</h2>
            <div class="flex items-center gap-1"><span class="text-lg font-semibold tabular-nums">{{ formatEuro(type.ownerTotalEur) }}</span><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Изменить тип и тариф" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click="openEdit(type)" /><UButton color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить тип апартамента" class="min-h-11 min-w-11 active:scale-[0.96] transition-transform" @click="askToDelete(type)" /></div>
          </div>
        </template>
        <dl class="grid grid-cols-3 gap-3 text-sm"><div><dt class="text-[var(--color-muted)]">Уборка</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.cleanerPoolEur) }}</dd></div><div><dt class="text-[var(--color-muted)]">Стирка</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.laundryEur) }}</dd></div><div><dt class="text-[var(--color-muted)]">Сервис</dt><dd class="mt-1 font-semibold tabular-nums">{{ formatEuro(type.serviceEur) }}</dd></div></dl>
        <div class="mt-5 border-t border-[var(--color-line)] pt-4"><p class="text-sm font-semibold">Стандартный чек-лист</p><ul v-if="type.defaultChecklist?.length" class="mt-2 space-y-1 text-sm text-[var(--color-muted)]"><li v-for="(item, index) in type.defaultChecklist" :key="`${type.id}-${index}`" class="flex items-start gap-2"><span class="mt-1 text-[var(--color-primary)]">{{ index + 1 }}.</span><span>{{ item }}</span></li></ul><p v-else class="mt-2 text-sm text-[var(--color-muted)]">Пункты не заданы</p></div>
      </UCard>
    </div>
    <EmptyState v-else icon="i-lucide-badge-euro" title="Типов пока нет" description="Создайте тип апартамента и задайте тариф и стандартный чек-лист." />

    <USlideover v-model:open="open" :title="typeToEdit ? 'Изменить тип и тариф' : 'Новый тип апартамента'">
      <template #body>
        <form class="form-grid" @submit.prevent="save">
          <UFormField label="Название"><UInput v-model="form.name" placeholder="Например, студия" required /></UFormField>
          <div class="rounded-xl bg-[var(--color-primary-soft)] px-4 py-3"><p class="text-sm text-[var(--color-muted)]">Общая стоимость</p><p class="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(totalEur) }}</p></div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3"><UFormField label="Уборка"><MoneyInput v-model="form.cleanerPoolEur" :empty-value="0" required /></UFormField><UFormField label="Стирка"><MoneyInput v-model="form.laundryEur" :empty-value="0" required /></UFormField><UFormField label="Сервис"><MoneyInput v-model="form.serviceEur" :empty-value="0" required /></UFormField></div>
          <section><div class="mb-2 flex items-start justify-between gap-3"><div><p class="font-semibold">Стандартный чек-лист</p><p class="text-sm text-[var(--color-muted)]">Скопируется в новые уборки этого типа.</p></div><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="addChecklistItem">Добавить</UButton></div><div class="space-y-2"><div v-for="(item, index) in form.defaultChecklist" :key="index" class="flex items-center gap-1.5"><span class="grid size-8 shrink-0 place-items-center text-sm tabular-nums text-[var(--color-muted)]">{{ index + 1 }}</span><UInput v-model="form.defaultChecklist[index]" class="flex-1" placeholder="Действие" required /><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-up" :disabled="index === 0" aria-label="Поднять пункт" @click="moveChecklistItem(index, -1)" /><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-down" :disabled="index === form.defaultChecklist.length - 1" aria-label="Опустить пункт" @click="moveChecklistItem(index, 1)" /><UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" aria-label="Удалить пункт" @click="removeChecklistItem(index)" /></div></div></section>
          <p class="text-sm text-[var(--color-muted)]">Изменения шаблона применяются только к новым уборкам. Уже созданные уборки сохраняют свой чек-лист.</p>
          <UAlert v-if="error && !deleteOpen" color="error" variant="soft" :description="error" />
          <div class="form-actions"><UButton type="button" color="neutral" variant="ghost" @click="open = false">Отмена</UButton><UButton type="submit" :loading="pending">{{ typeToEdit ? 'Сохранить изменения' : 'Создать тип' }}</UButton></div>
        </form>
      </template>
    </USlideover>
    <DeleteConfirmModal v-model:open="deleteOpen" title="Удалить тип и тариф" :description="`Тип «${typeToDelete?.name ?? ''}» будет удалён навсегда вместе со всеми апартаментами этого типа, их заездами, уборками, задачами, остатками, финансовыми записями и фотографиями.`" :loading="deletePending" :error="error" @confirm="removeType" />
  </section>
</template>
