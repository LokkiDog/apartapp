<script setup lang="ts">
type Member = { id: string; name: string; email?: string; roles: string[] }
type Group = { role: string; label: string }
type Option = { label: string; value: string }
type OptionGroup = Array<Option | { type: 'label'; label: string; value: string }>

const props = withDefaults(defineProps<{
  members: Member[]
  groups: Group[]
  searchPlaceholder: string
  placeholder?: string
  unmatchedLabel?: string
  showEmail?: boolean
  closeOnSelect?: boolean
  disabled?: boolean
}>(), { placeholder: '', unmatchedLabel: '', showEmail: false, closeOnSelect: true, disabled: false })
const model = defineModel<string[]>({ required: true })
const open = defineModel<boolean>('open', { default: false })

const options = computed(() => {
  const seen = new Set<string>()
  const result: OptionGroup[] = []
  for (const group of props.groups) {
    const members = props.members.filter(member => member.roles.includes(group.role) && !seen.has(member.id))
    if (!members.length) continue
    members.forEach(member => seen.add(member.id))
    result.push([
      { type: 'label', label: group.label, value: `__${group.role}__` },
      ...members.map(member => ({ label: props.showEmail && member.email ? `${member.name} · ${member.email}` : member.name, value: member.id }))
    ])
  }
  if (props.unmatchedLabel) {
    const unmatched = props.members.filter(member => !seen.has(member.id))
    if (unmatched.length) result.push([
      { type: 'label', label: props.unmatchedLabel, value: '__other__' },
      ...unmatched.map(member => ({ label: props.showEmail && member.email ? `${member.name} · ${member.email}` : member.name, value: member.id }))
    ])
  }
  return result
})
const summary = computed(() => props.members.filter(member => model.value.includes(member.id)).map(member => member.name).join(', '))

function onSelect() {
  if (props.closeOnSelect) open.value = false
}
</script>

<template>
  <USelectMenu
    v-model="model"
    v-model:open="open"
    :items="options as any"
    value-key="value"
    multiple
    :disabled="disabled"
    :search-input="{ placeholder: searchPlaceholder, variant: 'none', autofocus: false, ui: { root: 'm-2 w-auto self-stretch' } }"
    :content="{ align: 'start', sideOffset: 8, collisionPadding: 8, bodyLock: true }"
    :ui="{ base: 'w-full justify-start text-start', content: 'assignee-select-menu', viewport: 'min-h-0 overflow-y-auto overscroll-contain touch-pan-y', item: 'min-h-11 items-center', itemWrapper: 'justify-center', itemTrailing: 'self-center' }"
    class="w-full"
    @update:model-value="onSelect"
  >
    <template #default>
      <span v-if="summary" class="min-w-0 flex-1 truncate text-start">{{ summary }}</span>
      <span v-else class="flex-1 text-start">{{ placeholder }}</span>
    </template>
  </USelectMenu>
</template>
