export function compactStayServices<T>(services: readonly T[], max = 3) {
  const visible = services.slice(0, max)
  return { visible, hiddenCount: Math.max(0, services.length - visible.length) }
}
