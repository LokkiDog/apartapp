<script setup lang="ts">
type ChecklistItem = { label: string; checked: boolean }
type InventoryItem = { consumable: { id: string; name: string; unit: string; autoWriteOffEnabled?: boolean; autoWriteOffQuantity?: number }; quantity: number; usedQuantity: number; remainingQuantity: number; discrepancyQuantity: number; remainingTouched?: boolean }
type ProgressPayload = { checklist: ChecklistItem[]; comment: string; hasProblem: boolean; problemDescription: string; inventoryReports?: Array<{ consumableId: string; usedQuantity: number; remainingQuantity: number }>; photo: File | null }

const props = withDefaults(defineProps<{
  kind: 'cleaning' | 'task'
  checklist: ChecklistItem[]
  comment?: string
  hasProblem?: boolean
  problemDescription?: string
  inventoryReports?: InventoryItem[]
  editable?: boolean
  canComplete?: boolean
  canStock?: boolean
  inventoryEditable?: boolean
  busy?: boolean
  error?: string
  finishHint?: string
}>(), { comment: '', hasProblem: false, problemDescription: '', inventoryReports: () => [], editable: false, canComplete: false, canStock: false, inventoryEditable: false, busy: false, error: '', finishHint: '' })

const emit = defineEmits<{ save: [payload: ProgressPayload]; complete: [payload: ProgressPayload]; saveInventory: [reports: NonNullable<ProgressPayload['inventoryReports']>]; stock: [] }>()
const checklist = ref<ChecklistItem[]>([])
const comment = ref('')
const hasProblem = ref(false)
const problemDescription = ref('')
const photo = ref<File | null>(null)
const inventoryReports = ref<InventoryItem[]>([])

watch(() => [props.checklist, props.comment, props.hasProblem, props.problemDescription, props.inventoryReports], () => {
  checklist.value = props.checklist.map(item => ({ ...item }))
  comment.value = props.comment
  hasProblem.value = props.hasProblem
  problemDescription.value = props.problemDescription
  inventoryReports.value = props.inventoryReports.map(item => ({ ...item, consumable: { ...item.consumable }, remainingTouched: false }))
}, { immediate: true, deep: true })

function syncExpectedRemaining(item: InventoryItem) {
  if (!item.remainingTouched) item.remainingQuantity = Math.max(0, Number(item.quantity) - (Number(item.usedQuantity) || 0))
}

function payload(): ProgressPayload {
  return {
    checklist: checklist.value.map(item => ({ ...item })),
    comment: comment.value,
    hasProblem: hasProblem.value,
    problemDescription: problemDescription.value,
    inventoryReports: props.kind === 'cleaning' ? inventoryReports.value.map(item => ({ consumableId: item.consumable.id, usedQuantity: Number(item.usedQuantity) || 0, remainingQuantity: Number(item.remainingQuantity) || 0 })) : undefined,
    photo: photo.value
  }
}
function choosePhoto(event: Event) { photo.value = (event.target as HTMLInputElement).files?.[0] ?? null }
function save() { emit('save', payload()) }
function complete() { emit('complete', payload()) }
const unfinished = computed(() => checklist.value.filter(item => !item.checked).length)
</script>

<template>
  <form class="work-progress-form" @submit.prevent="save">
    <section v-if="kind === 'cleaning'" class="progress-section">
      <div class="progress-section__heading"><div><h2>Остатки расходников</h2><p class="progress-section__mobile-description">Можно заполнить сейчас или обновить позже.</p></div><UIcon name="i-lucide-package" class="size-5 text-[var(--color-primary)]" /></div>
      <div v-if="inventoryReports.length" class="progress-stock-list space-y-3">
        <div v-for="item in inventoryReports" :key="item.consumable.id" class="progress-stock-row">
          <div><p class="font-medium">{{ item.consumable.name }}</p><p class="text-sm text-[var(--color-muted)]">Сейчас: {{ item.quantity }} {{ item.consumable.unit }}<span v-if="item.consumable.autoWriteOffEnabled"> · Авто: {{ item.consumable.autoWriteOffQuantity }} {{ item.consumable.unit }}</span></p></div>
          <div class="progress-stock-fields mt-3 grid grid-cols-2 gap-3"><UFormField><template #label><span class="progress-stock-label--desktop">Израсходовано</span><span class="progress-stock-label--mobile">Доложено</span></template><UInput v-model.number="item.usedQuantity" type="number" min="0" step=".001" :disabled="!editable && !inventoryEditable" @update:model-value="syncExpectedRemaining(item)"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField><UFormField label="Фактически осталось"><UInput v-model.number="item.remainingQuantity" type="number" min="0" step=".001" :disabled="!editable && !inventoryEditable" @update:model-value="item.remainingTouched = true"><template #trailing>{{ item.consumable.unit }}</template></UInput></UFormField></div>
          <p v-if="item.discrepancyQuantity" class="mt-2 text-xs text-amber-700">Расхождение: {{ item.discrepancyQuantity > 0 ? '+' : '' }}{{ item.discrepancyQuantity }} {{ item.consumable.unit }}</p>
        </div>
      </div>
      <p v-else class="text-sm text-[var(--color-muted)]">Для этого апартамента расходники ещё не настроены.</p>
      <UButton v-if="canStock" type="button" color="neutral" variant="soft" icon="i-lucide-package-minus" class="mt-4" @click="emit('stock')">Списать расходник вручную</UButton>
      <UButton v-if="inventoryEditable" type="button" color="neutral" variant="soft" icon="i-lucide-save" class="mt-3" :loading="busy" @click="emit('saveInventory', inventoryReports.map(item => ({ consumableId: item.consumable.id, usedQuantity: Number(item.usedQuantity) || 0, remainingQuantity: Number(item.remainingQuantity) || 0 })))">Сохранить остатки</UButton>
    </section>

    <section class="progress-section" :class="{ 'progress-section--attention': finishHint }">
      <div class="progress-section__heading"><div><h2>Чек-лист</h2><p>{{ unfinished ? `Осталось пунктов: ${unfinished}` : 'Все пункты выполнены' }}</p></div><UIcon :name="unfinished ? 'i-lucide-list-checks' : 'i-lucide-circle-check'" class="size-5" :class="unfinished ? 'text-[var(--color-muted)]' : 'text-[var(--color-success)]'" /></div>
      <p v-if="finishHint" class="mb-3 text-sm font-medium text-amber-800">{{ finishHint }}</p>
      <div v-if="checklist.length" class="space-y-1"><UCheckbox v-for="item in checklist" :key="item.label" v-model="item.checked" :label="item.label" :disabled="!editable" class="min-h-11 items-center" /></div>
      <p v-else class="text-sm text-[var(--color-muted)]">Чек-лист не настроен.</p>
    </section>

    <section class="progress-section">
      <div class="progress-section__heading"><div><h2>Комментарий и проблема</h2><p>Добавьте важные детали для управляющего.</p></div><UIcon name="i-lucide-message-square-text" class="size-5 text-[var(--color-primary)]" /></div>
      <UFormField label="Комментарий" class="w-full"><UTextarea v-model="comment" class="w-full" :disabled="!editable" :rows="4" placeholder="Что важно знать об этой работе?" /></UFormField>
      <UCheckbox v-model="hasProblem" label="Есть проблема" :disabled="!editable" class="mt-4 min-h-11 items-center font-medium" />
      <UFormField v-if="hasProblem" label="Описание проблемы" class="mt-3 w-full"><UTextarea v-model="problemDescription" class="w-full" :disabled="!editable" required :rows="3" placeholder="Опишите, что произошло" /></UFormField>
    </section>

    <section class="progress-section">
      <div class="progress-section__heading"><div><h2>Фотография</h2><p>Необязательно, можно приложить подтверждение.</p></div><UIcon name="i-lucide-camera" class="size-5 text-[var(--color-primary)]" /></div>
      <UInput type="file" accept="image/*" :disabled="!editable" @change="choosePhoto" />
      <p v-if="photo" class="mt-2 text-sm text-[var(--color-muted)]">Выбрано: {{ photo.name }}</p>
    </section>

    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <div v-if="editable || canComplete" class="work-progress-actions" :class="{ 'work-progress-actions--in-cleaning': kind === 'cleaning' }">
      <template v-if="kind === 'cleaning'">
        <div class="work-progress-actions__secondary"><slot name="actions-left" /></div>
        <div class="work-progress-actions__primary">
          <UButton v-if="editable" type="submit" color="neutral" variant="soft" icon="i-lucide-save" aria-label="Сохранить" :loading="busy" />
          <UButton v-if="canComplete" type="button" icon="i-lucide-circle-check" :loading="busy" @click="complete">Завершить</UButton>
        </div>
      </template>
      <template v-else>
        <UButton v-if="editable" type="submit" color="neutral" variant="soft" icon="i-lucide-save" :loading="busy">Сохранить</UButton>
        <UButton v-if="canComplete" type="button" icon="i-lucide-circle-check" :loading="busy" @click="complete">Завершить</UButton>
      </template>
    </div>
  </form>
</template>
