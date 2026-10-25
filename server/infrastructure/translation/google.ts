import { createError } from 'h3'
import { MAX_MONTHLY_TRANSLATION_CHARACTERS, reserveTranslationCharacters } from './quota'
import { nameTranslationsSchema } from '../../../shared/contracts/crm'
import { translationLocales, type NameTranslations } from '../../../shared/utils/localized-name'

// Only the catalogue label is sent to Google, never a stay or guest record.
export async function translateServiceName(name: string, apiKey: string, monthlyLimit: unknown = MAX_MONTHLY_TRANSLATION_CHARACTERS): Promise<NameTranslations> {
  if (!apiKey) throw createError({ statusCode: 503, data: { code: 'TRANSLATION_NOT_CONFIGURED' }, message: 'Translation is not configured' })
  await reserveTranslationCharacters(name, monthlyLimit)
  try {
    const entries = await Promise.all(translationLocales.map(async target => {
      const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ q: name, target, format: 'text' }),
        signal: AbortSignal.timeout(10_000)
      })
      if (!response.ok) throw new Error('Translation provider failed')
      const result = await response.json() as { data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> } }
      const translation = result.data?.translations?.[0]
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
