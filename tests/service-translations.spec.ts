import { afterEach, describe, expect, it, vi } from 'vitest'
import { translateServiceName } from '../server/infrastructure/translation/google'
import { localizedName } from '../shared/utils/localized-name'
import { serviceTranslationInputSchema, specialServiceInputSchema } from '../shared/contracts/crm'

const { reserve } = vi.hoisted(() => ({ reserve: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../server/infrastructure/translation/quota', async importOriginal => ({
  ...await importOriginal<typeof import('../server/infrastructure/translation/quota')>(),
  reserveTranslationCharacters: reserve
}))

const fetchMock = vi.fn()
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); reserve.mockResolvedValue(undefined) })

describe('Google service name translation', () => {
  it('returns all UI languages and preserves the original in its detected language', async () => {
    vi.stubGlobal('fetch', fetchMock.mockImplementation(async (url, options) => {
      // Independent Google REST contract: plain text, server key, auto detection.
      expect(url).toBe('https://translation.googleapis.com/language/translate/v2')
      expect(options.headers['x-goog-api-key']).toBe('test-key')
      const body = JSON.parse(options.body)
      expect(body).toMatchObject({ q: 'Поздний выезд', format: 'text' })
      expect(body).not.toHaveProperty('source')
      const translatedText = { ru: 'Автоисправленный оригинал', en: 'Late checkout', he: 'צ׳ק־אאוט מאוחר' }[body.target as 'ru' | 'en' | 'he']
      return Response.json({ data: { translations: [{ translatedText, detectedSourceLanguage: 'ru' }] } })
    }))
    expect(await translateServiceName('Поздний выезд', 'test-key')).toEqual({ ru: 'Поздний выезд', en: 'Late checkout', he: 'צ׳ק־אאוט מאוחר' })
  })

  it('reports a missing key without making paid requests', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateServiceName('Трансфер', '')).rejects.toMatchObject({ statusCode: 503, data: { code: 'TRANSLATION_NOT_CONFIGURED' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not contact Google when the monthly reservation is rejected', async () => {
    vi.stubGlobal('fetch', fetchMock)
    reserve.mockRejectedValueOnce(Object.assign(new Error('Monthly translation limit reached'), { statusCode: 429, data: { code: 'TRANSLATION_MONTHLY_LIMIT' } }))
    await expect(translateServiceName('Трансфер', 'test-key')).rejects.toMatchObject({ statusCode: 429, data: { code: 'TRANSLATION_MONTHLY_LIMIT' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['http', 'empty', 'invalid', 'network'])('sanitizes %s provider failures', async mode => {
    vi.stubGlobal('fetch', fetchMock.mockImplementation(async () => {
      if (mode === 'network') throw new Error('sensitive-provider-details')
      if (mode === 'http') return new Response('sensitive-provider-details', { status: 403 })
      if (mode === 'invalid') return Response.json({ data: { translations: [{ translatedText: 'a'.repeat(241) }] } })
      return Response.json({ data: { translations: [] } })
    }))
    await expect(translateServiceName('Трансфер', 'test-key')).rejects.toMatchObject({ statusCode: 502, message: 'Translation failed', data: { code: 'TRANSLATION_FAILED' } })
  })
})

describe('localized catalogue names', () => {
  it('uses a manually edited translation and falls back to the original for missing or blank values', () => {
    const names = { en: 'Private transfer', he: '  ' }
    expect(localizedName('Трансфер', names, 'en')).toBe('Private transfer')
    expect(localizedName('Трансфер', names, 'he')).toBe('Трансфер')
    expect(localizedName('Трансфер', undefined, 'ru')).toBe('Трансфер')
  })

  it('accepts manual translations and rejects unsupported languages and overlong input', () => {
    const service = { name: 'Трансфер', priceEur: 20, managerSharePercent: 10, nameTranslations: { en: ' Private transfer ', he: '' } }
    expect(specialServiceInputSchema.parse(service).nameTranslations).toEqual({ en: 'Private transfer', he: '' })
    expect(specialServiceInputSchema.safeParse({ ...service, nameTranslations: { fr: 'Transfert' } }).success).toBe(false)
    expect(serviceTranslationInputSchema.safeParse({ name: 'a'.repeat(121) }).success).toBe(false)
    expect(serviceTranslationInputSchema.safeParse({ name: '  ' }).success).toBe(false)
  })
})
