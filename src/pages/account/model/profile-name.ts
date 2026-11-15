import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { SocialContact } from '@contracts/public-site'

type ProfileSource = { id: string; name: string; phone?: string; socials?: SocialContact[] }
const sameSocials = (left: SocialContact[], right: SocialContact[]) => JSON.stringify(left) === JSON.stringify(right)
const copySocials = (socials: SocialContact[]) => socials.map(channel => ({ ...channel }))

export function useProfileName(user: Readonly<Ref<ProfileSource | null>>) {
  const empty = () => ({ name: '', phone: '', socials: [] as SocialContact[] })
  const form = reactive(empty())
  const saved = ref(empty())

  watch(() => user.value, (value, previous) => {
    const next = { name: value?.name ?? '', phone: value?.phone ?? '', socials: copySocials(value?.socials ?? []) }
    const accountChanged = value?.id !== previous?.id
    if (accountChanged || form.name === saved.value.name) form.name = next.name
    if (accountChanged || form.phone === saved.value.phone) form.phone = next.phone
    if (accountChanged || sameSocials(form.socials, saved.value.socials)) form.socials = copySocials(next.socials)
    saved.value = next
  }, { immediate: true, flush: 'sync' })

  const changed = computed(() => form.name.trim() !== saved.value.name || form.phone.trim() !== saved.value.phone
    || !sameSocials(form.socials, saved.value.socials))

  function accept(name: string, phone = form.phone, socials = form.socials) {
    saved.value = { name, phone, socials: copySocials(socials) }
    Object.assign(form, { name, phone, socials: copySocials(socials) })
  }

  return { form, changed, accept }
}
