<script setup lang="ts">
import { bookingTemplateFields, messagingTemplateSchema, type BookingTemplateField, type MessagingTemplate } from '@contracts/messaging-template'
import { DeleteConfirmModal, ResponsiveFormDialog } from '#fsd/shared/ui'

const props = defineProps<{ identity: string }>()
const { t } = useI18n()
const endpoint = '/api/messaging/templates'
const { data: templates, error, status, refresh } = useAsyncData(
  computed(() => `reply-templates:${props.identity}`),
  (_app, { signal }) => $fetch<MessagingTemplate[]>(endpoint, { signal }),
  { server: false, default: () => [] },
)
const editorOpen = ref(false)
const deleteOpen = ref(false)
const editingId = ref<string>()
const deleting = ref<MessagingTemplate>()
const draft = reactive({ name: '', text: '' })
const busy = ref(false)
const mutationError = ref('')
const formId = useId()
const input = computed(() => messagingTemplateSchema.safeParse(draft))

const templateInput = ref<{ textareaRef?: HTMLTextAreaElement }>()
const templateLimit = 4096

async function insertField(field: BookingTemplateField) {
  const input = templateInput.value?.textareaRef
  const start = input?.selectionStart ?? draft.text.length
  const end = input?.selectionEnd ?? start
  const token = `{{${field}}}`
  const updated = draft.text.slice(0, start) + token + draft.text.slice(end)
  if (updated.length > templateLimit) return
  draft.text = updated
  await nextTick()
  input?.focus()
  input?.setSelectionRange(start + token.length, start + token.length)
}

function edit(template?: MessagingTemplate) {
  editingId.value = template?.id
  draft.name = template?.name ?? ''
  draft.text = template?.text ?? ''
  mutationError.value = ''
  editorOpen.value = true
}

function confirmDelete(template: MessagingTemplate) {
  deleting.value = template
  mutationError.value = ''
  deleteOpen.value = true
}

async function save() {
  if (busy.value || !input.value.success) return
  const id = editingId.value
  busy.value = true
  mutationError.value = ''
  try {
    const template = await $fetch<MessagingTemplate>(id ? `${endpoint}/${id}` : endpoint, {
      method: id ? 'PUT' : 'POST',
      body: input.value.data,
    })
    templates.value = [...templates.value.filter(item => item.id !== template.id), template]
      .sort((a, b) => a.name.localeCompare(b.name))
    editorOpen.value = false
  } catch {
    mutationError.value = t('common.error')
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!deleting.value || busy.value) return
  const { id } = deleting.value
  busy.value = true
  mutationError.value = ''
  try {
    await $fetch(`${endpoint}/${id}`, { method: 'DELETE' })
    templates.value = templates.value.filter(item => item.id !== id)
    deleteOpen.value = false
  } catch {
    mutationError.value = t('common.error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="px-3.5 pb-3.5">
    <div class="mb-2 flex justify-end">
      <UButton type="button" variant="soft" icon="i-lucide-plus" class="min-h-11" @click="edit()">
        {{ t('messaging.templates.add') }}
      </UButton>
    </div>
    <div v-if="error" class="flex flex-wrap items-center gap-2">
      <p class="text-sm" role="alert">{{ t('messaging.integrationLoadError') }}</p>
      <UButton variant="ghost" :loading="status === 'pending'" @click="refresh()">{{ t('messaging.retry') }}</UButton>
    </div>
    <p v-else-if="status === 'pending'" class="text-sm" role="status">{{ t('messaging.loading') }}</p>
    <p v-else-if="!templates.length" class="text-sm text-[var(--color-muted)]">{{ t('messaging.templates.empty') }}</p>
    <ul v-else class="divide-y divide-[var(--color-line)]">
      <li v-for="template in templates" :key="template.id" class="flex items-center gap-2 py-1">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ template.name }}</p>
          <p class="truncate text-xs text-[var(--color-muted)]">{{ template.text }}</p>
        </div>
        <UDropdownMenu :items="[
          { label: t('messaging.templates.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(template) },
          { label: t('messaging.templates.delete'), icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(template) },
        ]">
          <UButton
            color="neutral" variant="ghost" icon="i-lucide-ellipsis"
            class="size-11 justify-center"
            :aria-label="t('messaging.templates.actions', { name: template.name })"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <ResponsiveFormDialog
      v-model:open="editorOpen"
      :modal="true"
      :overlay="true"
      :title="t(editingId ? 'messaging.templates.edit' : 'messaging.templates.add')"
      :dismissible="!busy"
    >
      <template #body>
        <form :id="formId" class="space-y-3" @submit.prevent="save">
          <UFormField :label="t('messaging.templates.name')" required>
            <UInput v-model="draft.name" :maxlength="100" :disabled="busy" required />
          </UFormField>
          <UFormField :label="t('messaging.message')" required>
            <UTextarea ref="templateInput" v-model="draft.text" class="w-full" :maxlength="templateLimit" :disabled="busy" required />
          </UFormField>
          <fieldset :disabled="busy">
            <legend class="text-sm font-medium">{{ t('messaging.templates.templateFields') }}</legend>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="field in bookingTemplateFields"
                :key="field"
                type="button"
                size="sm"
                variant="soft"
                icon="i-lucide-plus"
                @click="insertField(field)"
              >{{ t(`messaging.templates.${field}`) }}</UButton>
            </div>
          </fieldset>
          <UAlert v-if="mutationError" color="error" role="alert" :description="mutationError" />
        </form>
      </template>
      <template #footer>
        <div class="form-actions form-actions--footer">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="editorOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton type="submit" :form="formId" :loading="busy" :disabled="!input.success">
            {{ t('common.save') }}
          </UButton>
        </div>
      </template>
    </ResponsiveFormDialog>
    <DeleteConfirmModal
      v-model:open="deleteOpen"
      :title="t('messaging.templates.delete')"
      :description="deleting?.name ?? ''"
      :loading="busy"
      :error="mutationError"
      @confirm="remove"
    />
  </div>
</template>
