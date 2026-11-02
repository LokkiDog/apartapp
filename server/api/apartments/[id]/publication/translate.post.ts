import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { publicationTranslationInputSchema } from '@contracts/publication'
import { requireActor } from '../../../../infrastructure/auth/actor'
import { getPublication } from '../../../../modules/publication/publication.service'
import { translatePublicationCopy } from '../../../../infrastructure/translation/google'
import { checkTranslationRateLimit } from '../../../../infrastructure/translation/rate-limit'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  await getPublication(actor, getRouterParam(event, 'id')!)
  const { source } = publicationTranslationInputSchema.parse(await readBody(event))
  checkTranslationRateLimit(event, actor)
  const config = useRuntimeConfig(event)
  return { translations: await translatePublicationCopy(source, config.googleTranslationApiKey, config.googleTranslationMonthlyCharacterLimit) }
})
