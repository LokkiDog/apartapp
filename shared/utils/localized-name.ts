export const translationLocales = ['ru', 'en', 'he'] as const
export type TranslationLocale = typeof translationLocales[number]
export type NameTranslations = Partial<Record<TranslationLocale, string>>

export function localizedName(original: string, translations: NameTranslations | null | undefined, locale: string): string {
  return translations?.[locale as TranslationLocale]?.trim() || original
}
