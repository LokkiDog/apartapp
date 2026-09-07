function encodeRFC5987Value(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function inlineContentDisposition(fileName: string) {
  const fallback = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim() || 'image'

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987Value(fileName)}`
}
