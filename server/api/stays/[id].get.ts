import { z } from 'zod'
import { requireActor } from '../../infrastructure/auth/actor'
import { getStayDetails } from '../../modules/stay/stay.service'

export default defineEventHandler(async event => getStayDetails(
  await requireActor(event), z.uuid().parse(getRouterParam(event, 'id')),
))
