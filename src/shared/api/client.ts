import { useI18n } from 'vue-i18n'

export function useCrmFetch<T>(url: string, options?: Parameters<typeof $fetch<T>>[1]) {
  const { locale } = useI18n()
  const headers = new Headers(options?.headers as HeadersInit | undefined)
  if (!headers.has('accept-language')) headers.set('accept-language', locale.value)
  return $fetch<T>(url, { credentials: 'include', ...options, headers })
}
