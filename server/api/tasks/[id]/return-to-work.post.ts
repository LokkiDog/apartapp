import { requireActor } from '../../../infrastructure/auth/actor'
import { returnTaskToWork } from '../../../modules/task/task.service'
import { returnCashTaskToWork } from '../../../modules/task/cash-task.service'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../infrastructure/database/client'
import { tasks } from '../../../infrastructure/database/schema'

export default defineEventHandler(async event => {
  const actor = await requireActor(event)
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, getRouterParam(event, 'id')!), eq(tasks.organizationId, actor.organizationId)) })
  return task?.category === 'cash' ? returnCashTaskToWork(actor, task.id) : returnTaskToWork(actor, getRouterParam(event, 'id')!)
})
