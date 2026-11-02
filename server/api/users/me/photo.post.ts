import { requirePrincipal } from '../../../infrastructure/auth/platform'
import { setOwnProfilePhoto } from '../../../modules/auth/profile.service'
export default defineEventHandler(async event => {
  const actor = await requirePrincipal(event)
  setHeader(event, 'cache-control', 'no-store')
  const file = (await readMultipartFormData(event))?.find(item => item.name === 'file'); if (!file) throw createError({ statusCode: 400 }); return setOwnProfilePhoto(actor, file)
})
