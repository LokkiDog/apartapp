import { createError } from 'h3'
import { MAX_MONTHLY_TRANSLATION_CHARACTERS, reserveTranslationCharacters } from './quota'
import { nameTranslationsSchema } from '../../../shared/contracts/crm'
import { publicationTranslationLocales, publicCopyFields, publicationTranslationResultSchema, type PublicCopy, type PublicationTargetTranslations } from '../../../shared/contracts/publication'
import { translationLocales, type NameTranslations } from '../../../shared/utils/localized-name'

// Only the catalogue label is sent to Google, never a stay or guest record.
export async function translateServiceName(name: string, apiKey: string, monthlyLimit: unknown = MAX_MONTHLY_TRANSLATION_CHARACTERS): Promise<NameTranslations> {
  if (!apiKey) throw createError({ statusCode: 503, data: { code: 'TRANSLATION_NOT_CONFIGURED' }, message: 'Translation is not configured' })
  await reserveTranslationCharacters(name, monthlyLimit)
  try {
    const entries = await Promise.all(translationLocales.map(async target => {
      const translations = await requestTranslation(name, target, apiKey)
      const translation = translations[0]
      const source = translation?.detectedSourceLanguage === 'iw' ? 'he' : translation?.detectedSourceLanguage
      const text = source === target ? name : translation?.translatedText?.trim()
      if (!text) throw new Error('Empty translation')
      return [target, text] as const
    }))
    return nameTranslationsSchema.parse(Object.fromEntries(entries))
  } catch {
    // Do not expose provider responses, credentials or submitted labels in errors.
    throw createError({ statusCode: 502, data: { code: 'TRANSLATION_FAILED' }, message: 'Translation failed' })
  }
}

async function requestTranslation(q: string | string[], target: string, apiKey: string) {
  const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ q, target, format: 'text' }),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error('Translation provider failed')
  const result = await response.json() as { data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> } }
  return result.data?.translations ?? []
}

/** Only the four public listing fields are sent; apartment and guest records stay local. */
export async function translatePublicationCopy(source: PublicCopy, apiKey: string, monthlyLimit: unknown = MAX_MONTHLY_TRANSLATION_CHARACTERS): Promise<PublicationTargetTranslations> {
  if (!apiKey) throw createError({ statusCode: 503, data: { code: 'TRANSLATION_NOT_CONFIGURED' }, message: 'Translation is not configured' })
  const fields = publicCopyFields.filter(field => source[field].trim())
  const texts = fields.map(field => source[field].trim())
  // Three target languages, matching the shared billing counter's character multiplier.
  await reserveTranslationCharacters(texts.join(''), monthlyLimit)
  try {
    const entries = await Promise.all(publicationTranslationLocales.map(async target => {
      const translations = await requestTranslation(texts, target, apiKey)
      if (translations.length !== fields.length) throw new Error('Incomplete translation')
      const copy: PublicCopy = { title: '', summary: '', description: '', location: '' }
      fields.forEach((field, index) => {
        const translation = translations[index]
        const detectedSource = translation?.detectedSourceLanguage === 'iw' ? 'he' : translation?.detectedSourceLanguage
        const text = detectedSource === target ? texts[index] : translation?.translatedText?.trim()
        if (!text) throw new Error('Empty translation')
        copy[field] = text
      })
      return [target, copy] as const
    }))
    return publicationTranslationResultSchema.parse(Object.fromEntries(entries))
  } catch {
    throw createError({ statusCode: 502, data: { code: 'TRANSLATION_FAILED' }, message: 'Translation failed' })
  }
}
