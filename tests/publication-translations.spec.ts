import { afterEach, describe, expect, it, vi } from 'vitest'
import { translatePublicationCopy } from '../server/infrastructure/translation/google'
import { publicationTranslationInputSchema, publicationInputSchema } from '../shared/contracts/publication'

const { reserve } = vi.hoisted(() => ({ reserve: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../server/infrastructure/translation/quota', async importOriginal => ({
  ...await importOriginal<typeof import('../server/infrastructure/translation/quota')>(),
  reserveTranslationCharacters: reserve,
}))
const source = { title: 'Mountain View', summary: 'Уютная студия', description: 'Квартира с кухней. '.repeat(20).trim(), location: '' }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); reserve.mockResolvedValue(undefined) })

describe('publication translations', () => {
  it('batches public fields for all targets, preserving originals detected in a target language', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      expect(url).toBe('https://translation.googleapis.com/language/translate/v2')
      expect(options.headers['x-goog-api-key']).toBe('test-key')
      const body = JSON.parse(options.body)
      expect(body.q).toEqual([source.title, source.summary, source.description])
      expect(body.format).toBe('text')
      expect(body).not.toHaveProperty('source')
      requests.push(body.target)
      return Response.json({ data: { translations: body.q.map((text: string, index: number) => ({ translatedText: index === 2 ? `${body.target} ${text}` : `${body.target}-${index}`, detectedSourceLanguage: index === 0 ? 'en' : 'ru' })) } })
    }))
    const translated = await translatePublicationCopy(source, 'test-key', 450000)
    expect(requests.sort()).toEqual(['bg', 'en', 'he'])
    expect(translated.en.title).toBe('Mountain View')
    expect(translated.he.title).toBe('he-0')
    expect(translated.bg.summary).toBe('bg-1')
    expect(translated.en.description).toBe(`en ${source.description}`)
    expect(translated.en.location).toBe('')
    expect(reserve).toHaveBeenCalledOnce()
    expect(reserve).toHaveBeenCalledWith(source.title + source.summary + source.description, 450000)
  })

  it('does not contact the provider without configuration or an accepted quota reservation', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(translatePublicationCopy(source, '')).rejects.toMatchObject({ data: { code: 'TRANSLATION_NOT_CONFIGURED' } })
    reserve.mockRejectedValueOnce(Object.assign(new Error('limit'), { data: { code: 'TRANSLATION_MONTHLY_LIMIT' } }))
    await expect(translatePublicationCopy(source, 'test-key')).rejects.toMatchObject({ data: { code: 'TRANSLATION_MONTHLY_LIMIT' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['http', 'partial', 'empty', 'overlong', 'network'])('rejects and sanitizes %s provider responses', async mode => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (mode === 'network') throw new Error('private-provider-response')
      if (mode === 'http') return new Response('private-provider-response', { status: 403 })
      const texts = mode === 'partial' ? ['title'] : mode === 'empty' ? ['', 'summary', 'description'] : ['t'.repeat(161), 'summary', 'description']
      return Response.json({ data: { translations: texts.map(translatedText => ({ translatedText })) } })
    }))
    await expect(translatePublicationCopy(source, 'test-key')).rejects.toMatchObject({ statusCode: 502, message: 'Translation failed', data: { code: 'TRANSLATION_FAILED' } })
  })

  it('accepts manual Hebrew and Bulgarian copy and rejects private or empty translation input', () => {
    expect(publicationTranslationInputSchema.safeParse({ source }).success).toBe(true)
    expect(publicationTranslationInputSchema.safeParse({ source: {} }).success).toBe(false)
    expect(publicationTranslationInputSchema.safeParse({ source: { ...source, guestPhone: 'private' } }).success).toBe(false)
    const draft = { published: false, slug: 'studio', translations: { ru: source, he: { title: 'סטודיו' }, bg: { title: 'Студио' } } }
    expect(publicationInputSchema.parse(draft).translations.he?.title).toBe('סטודיו')
    expect(publicationInputSchema.safeParse({ ...draft, translations: { ...draft.translations, fr: source } }).success).toBe(false)
  })
})
