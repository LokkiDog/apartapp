import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../database/client'
import { translationLocales } from '../../../shared/utils/localized-name'

export const MAX_MONTHLY_TRANSLATION_CHARACTERS = 450_000

export function translationCharacterCount(name: string): number {
  // Google bills Unicode code points for every target, including the original language.
  return Array.from(name).length * translationLocales.length
}

export function monthlyTranslationLimit(value: unknown): number {
  const limit = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_MONTHLY_TRANSLATION_CHARACTERS) {
    throw createError({ statusCode: 503, data: { code: 'TRANSLATION_LIMIT_INVALID' }, message: 'Invalid translation limit' })
  }
  return limit
}

export async function reserveTranslationCharacters(name: string, configuredLimit: unknown): Promise<void> {
  const limit = monthlyTranslationLimit(configuredLimit)
  const characters = translationCharacterCount(name)
  // This is a platform billing counter shared by every organization and app replica.
  // It deliberately contains no tenant data. One atomic statement serializes reservations.
  // Use Google's billing month (Pacific Time), from the database clock on every replica.
  const rows = await db.execute(sql`
    INSERT INTO translation_monthly_usage (month, characters)
    SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM'), ${characters}
    WHERE ${characters} <= ${limit}
    ON CONFLICT (month) DO UPDATE
    SET characters = translation_monthly_usage.characters + EXCLUDED.characters
    WHERE translation_monthly_usage.characters + EXCLUDED.characters <= ${limit}
    RETURNING month
  `)
  if (!rows.length) {
    throw createError({ statusCode: 429, data: { code: 'TRANSLATION_MONTHLY_LIMIT' }, message: 'Monthly translation limit reached' })
  }
  // Never refund a reservation: timeouts, partial failures and client disconnects may be billed.
}
