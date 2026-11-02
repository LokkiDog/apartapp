import { computed, reactive, ref, watch, type Ref } from 'vue'
import { publicBioSchema, type PublicBio } from '@contracts/public-site'

type ProfileSource = { id: string; name: string; phone?: string; publicBio?: PublicBio }
export function useProfileName(user: Readonly<Ref<ProfileSource | null>>) {
  const form = reactive({ name: '', phone: '', publicBio: publicBioSchema.parse({}) })
  const saved = ref({ name: '', phone: '', publicBio: publicBioSchema.parse({}) })
  watch(() => user.value, (value, previous) => {
    const next = { name: value?.name ?? '', phone: value?.phone ?? '', publicBio: publicBioSchema.parse(value?.publicBio ?? {}) }
    const accountChanged = value?.id !== previous?.id
    if (accountChanged || form.name === saved.value.name) form.name = next.name
    if (accountChanged || form.phone === saved.value.phone) form.phone = next.phone
    if (accountChanged || JSON.stringify(form.publicBio) === JSON.stringify(saved.value.publicBio)) form.publicBio = { ...next.publicBio }
    saved.value = next
  }, { immediate: true, flush: 'sync' })
  const changed = computed(() => form.name.trim() !== saved.value.name || form.phone.trim() !== saved.value.phone
    || Object.keys(form.publicBio).some(key => form.publicBio[key as keyof PublicBio].trim() !== saved.value.publicBio[key as keyof PublicBio]))
  function accept(name: string, phone = form.phone, publicBio = form.publicBio) {
    saved.value = { name, phone, publicBio: { ...publicBio } }
    Object.assign(form, { name, phone, publicBio: { ...publicBio } })
  }
  return { form, changed, accept }
}
