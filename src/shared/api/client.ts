export function useCrmFetch<T>(url: string, options?: Parameters<typeof $fetch<T>>[1]) {
  return $fetch<T>(url, { credentials: 'include', ...options })
}
