import { ru } from '../content/ru'
export function useSite() {
  const config = useRuntimeConfig()
  const phone = computed(() => String(config.public.whatsapp).replace(/[^0-9]/g, ''))
  const contact = (title?: string, slug?: string) => {
    if (!/^[1-9][0-9]{6,14}$/.test(phone.value)) return undefined
    const message = title && slug ? `Здравствуйте! Хочу уточнить даты и стоимость: ${title}. ${config.public.siteUrl}/apartments/${slug}` : 'Здравствуйте! Хочу подобрать апартамент в Банско и уточнить даты.'
    return `https://wa.me/${phone.value}?text=${encodeURIComponent(message)}`
  }
  return { copy: ru, config, contact }
}
