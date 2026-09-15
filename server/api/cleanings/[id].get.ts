import { requireActor } from '../../infrastructure/auth/actor'
import { listCleanings } from '../../modules/cleaning/cleaning.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const cleaningId = getRouterParam(event, 'id')
  if (!cleaningId) throw createError({ statusCode: 400, statusMessage: 'Не указан идентификатор уборки' })
  const result = await listCleanings(actor)
  const cleaning = Array.isArray(result) ? result.find(item => item.id === cleaningId) : undefined
  if (!cleaning) throw createError({ statusCode: 404, statusMessage: 'Уборка не найдена' })
  return cleaning
})
