import { defineEventHandler, readBody } from 'h3'
import { serviceTranslationInputSchema } from '@contracts/crm'
import { requireActor, requireRole } from '../../infrastructure/auth/actor'
import { translateServiceName } from '../../infrastructure/translation/google'
import { checkTranslationRateLimit } from '../../infrastructure/translation/rate-limit'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireRole(actor, 'administrator')
  const { name } = serviceTranslationInputSchema.parse(await readBody(event))
  checkTranslationRateLimit(event, actor)
  const config = useRuntimeConfig(event)
  const nameTranslations = await translateServiceName(name, config.googleTranslationApiKey, config.googleTranslationMonthlyCharacterLimit)
  return { nameTranslations }
})
