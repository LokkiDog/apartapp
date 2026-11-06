import { z } from 'zod'
import { requireActor, requireWorkSectionAccess } from '../../../infrastructure/auth/actor'
import { organizationProfilePhoto } from '../../../modules/auth/profile.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  requireWorkSectionAccess(actor)
  const userId = z.uuid().parse(getRouterParam(event, 'id'))
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'content-type', 'image/webp')
  return organizationProfilePhoto(actor, userId)
})
