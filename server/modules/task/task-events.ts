import type { Actor } from '../../infrastructure/auth/actor'
import { administratorsForOrganization } from '../../infrastructure/notification/publish'
import { publishNotification, type NotificationRealtimeMessage } from '../../infrastructure/notification/realtime'

export type TaskChangeReason = Extract<NotificationRealtimeMessage, { type: 'task.changed' }>['reason']

export async function publishTaskChange(input: {
  actor: Actor
  taskId: string
  assigneeIds?: Array<string | null | undefined>
  reason: TaskChangeReason
}) {
  const userIds = new Set([
    input.actor.id,
    ...(await administratorsForOrganization(input.actor.organizationId)),
    ...(input.assigneeIds ?? []).filter((id): id is string => Boolean(id))
  ])
  const occurredAt = new Date().toISOString()
  for (const userId of userIds) publishNotification(userId, { type: 'task.changed', taskId: input.taskId, reason: input.reason, occurredAt })
}
