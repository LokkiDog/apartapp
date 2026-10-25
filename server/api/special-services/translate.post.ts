import { createError, defineEventHandler, readBody, setResponseHeader } from 'h3'
import { serviceTranslationInputSchema } from '@contracts/crm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { translateServiceName } from '../../infrastructure/translation/google'

const attempts = new Map<string, { count: number; expires: number }>()

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const { name } = serviceTranslationInputSchema.parse(await readBody(event))
  const now = Date.now()
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key)
  const key = `${actor.organizationId}:${actor.id}`
  const limit = attempts.get(key) ?? { count: 0, expires: now + 60_000 }
  if (limit.count >= 10) {
    setResponseHeader(event, 'Retry-After', Math.ceil((limit.expires - now) / 1000))
    throw createError({ statusCode: 429, data: { code: 'TRANSLATION_RATE_LIMIT' }, message: 'Too many translation requests' })
  }
  limit.count++
  attempts.set(key, limit)
  const config = useRuntimeConfig(event)
  const nameTranslations = await translateServiceName(name, config.googleTranslationApiKey, config.googleTranslationMonthlyCharacterLimit)
  return { nameTranslations }
})
