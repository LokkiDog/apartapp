import { z } from 'zod'
import { requireSuperuser } from '../../../../infrastructure/auth/platform'
import { oauthUrls } from '../../../../modules/ai-agents/oauth-config'
import { getClientHelp } from '../../../../modules/platform/client-help'

export default defineEventHandler(async event => {
  await requireSuperuser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Клиент не найден' })
  const { issuer, resource } = oauthUrls(event)
  return getClientHelp(id.data, issuer, resource)
})
