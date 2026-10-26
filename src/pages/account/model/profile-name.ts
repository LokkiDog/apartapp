import { computed, reactive, ref, watch, type Ref } from 'vue'

export function useProfileName(user: Ref<{ id: string; name: string } | null>) {
  const form = reactive({ name: '' })
  const savedName = ref('')
  watch(() => [user.value?.id, user.value?.name] as const, ([id, name], previous) => {
    const pristine = form.name === savedName.value
    savedName.value = name ?? ''
    if (id !== previous?.[0] || pristine) form.name = savedName.value
  }, { immediate: true, flush: 'sync' })
  const changed = computed(() => form.name.trim() !== savedName.value)
  function accept(name: string) { savedName.value = name; form.name = name }
  return { form, changed, accept }
}
