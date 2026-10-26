import { describe, expect, it } from 'vitest'
import { publicationInputSchema } from '../shared/contracts/publication'

const draft = { published: false, slug: 'mountain-view', translations: { ru: { title: '', summary: '', description: '', location: '' } }, photoIds: [], amenities: [], sortOrder: 0 }
describe('apartment publication input', () => {
  it('allows incomplete drafts but requires guest copy and a photo for publication', () => {
    expect(publicationInputSchema.safeParse(draft).success).toBe(true)
    expect(publicationInputSchema.safeParse({ ...draft, published: true }).success).toBe(false)
    expect(publicationInputSchema.safeParse({ ...draft, published: true, translations: { ru: { ...draft.translations.ru, title: 'Студия', summary: 'В центре Банско', description: 'Квартира с кухней.' } }, photoIds: ['11111111-1111-4111-8111-111111111111'] }).success).toBe(true)
  })
  it('rejects URL traversal, repeated photos and unknown fields', () => {
    for (const changes of [{ slug: '../private' }, { slug: 'UpperCase' }, { photoIds: ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'] }, { organizationId: 'foreign' }, { amenities: ['invented'] }]) expect(publicationInputSchema.safeParse({ ...draft, ...changes }).success).toBe(false)
  })
})
