import { requireActor } from '../../infrastructure/auth/actor'
import { listTasks } from '../../modules/task/task.service'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw createError({ statusCode: 400, statusMessage: 'Не указан идентификатор задачи' })
  const result = await listTasks(actor)
  const task = Array.isArray(result) ? result.find(item => item.id === taskId) : undefined
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Задача не найдена' })
  return task
})
