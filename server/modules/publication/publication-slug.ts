const transliteration: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
}
function latinSlug(value: string) {
  return [...value.toLowerCase().replace(/№/g, ' ').replace(/ьо/g, 'yo')].map(letter => transliteration[letter] ?? letter).join('')
    .normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function fit(value: string, suffix = '') {
  return value.slice(0, 120 - suffix.length).replace(/-+$/g, '') + suffix
}

/** Saved custom addresses stay explicit; generated defaults are resolved again at save time. */
export function resolvePublicationSlug(name: string, hotelName: string, occupied: ReadonlySet<string>, preferred?: string) {
  const base = fit(latinSlug(name) || 'apartment')
  const hotel = latinSlug(hotelName)
  const withHotel = hotel ? fit(`${hotel}-${base}`) : base
  if (preferred && preferred !== base && !occupied.has(preferred)) return preferred
  const suffix = preferred?.match(/-(\d+)$/)?.[0]
  if (preferred && preferred !== base && preferred !== withHotel
    && !(suffix && preferred === fit(withHotel, suffix))) return preferred
  if (!occupied.has(withHotel)) return withHotel
  for (let number = 2; ; number++) {
    const candidate = fit(withHotel, `-${number}`)
    if (!occupied.has(candidate)) return candidate
  }
}
