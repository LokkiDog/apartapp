import { describe, expect, it } from 'vitest'
import { resolvePublicationSlug } from '../server/modules/publication/publication-slug'

const free = new Set<string>()
describe('default publication address', () => {
  it.each([
    ['Вид на горы № 12', 'vid-na-gory-12'],
    ['Ёлки у реки', 'yolki-u-reki'],
    ['Синьо небе', 'sinyo-nebe'],
    ['Étage & Mountain View', 'etage-mountain-view'],
    ['!!!', 'apartment'],
  ])('transliterates %s into a readable URL', (name, expected) => {
    expect(resolvePublicationSlug(name, 'Hotel', free)).toBe(`hotel-${expected}`)
  })

  it('always includes the hotel before numeric suffixes, including when long names are truncated', () => {
    expect(resolvePublicationSlug('Студия', 'Пирин', free)).toBe('pirin-studiya')
    expect(resolvePublicationSlug('Студия', '', free)).toBe('studiya')
    expect(resolvePublicationSlug('Студия', 'Пирин', free, 'studiya')).toBe('pirin-studiya')
    expect(resolvePublicationSlug('Студия', 'Пирин', new Set(['studiya', 'pirin-studiya', 'pirin-studiya-2']))).toBe('pirin-studiya-3')
    const name = 'a'.repeat(200)
    const occupied = new Set(['a'.repeat(120), `hotel-${'a'.repeat(114)}`])
    expect(resolvePublicationSlug(name, 'Hotel', occupied)).toBe(`hotel-${'a'.repeat(112)}-2`)
    expect(resolvePublicationSlug(name, 'Hotel', occupied, `hotel-${'a'.repeat(112)}-2`)).toBe(`hotel-${'a'.repeat(112)}-2`)
  })

  it('retains custom input while resolving generated addresses that became occupied', () => {
    const occupied = new Set(['studiya', 'pirin-studiya', 'my-custom-address'])
    expect(resolvePublicationSlug('Студия', 'Пирин', occupied, 'studiya')).toBe('pirin-studiya-2')
    expect(resolvePublicationSlug('Студия', 'Пирин', occupied, 'another-address')).toBe('another-address')
    expect(resolvePublicationSlug('Студия', 'Пирин', occupied, 'my-custom-address')).toBe('my-custom-address')
  })
})
