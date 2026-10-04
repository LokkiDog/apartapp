// Resolve token aliases so colour contracts survive a change in CSS representation.
export function resolveCssColor(styles: string, value: string): string {
  const seen = new Set<string>()
  while (value.startsWith('var(')) {
    const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1]
    if (!token || seen.has(token)) throw new Error(`Invalid or cyclic colour: ${value}`)
    seen.add(token)
    const declaration = new RegExp(`${token}:\\s*([^;]+);`).exec(styles)?.[1]?.trim()
    if (!declaration) throw new Error(`Missing colour token: ${token}`)
    value = declaration
  }
  return value
}
