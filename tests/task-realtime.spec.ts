import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('task realtime updates', () => {
  it('publishes every task mutation to administrators and the assignee', () => {
    const service = readFileSync('server/modules/task/task.service.ts', 'utf8')
    const events = readFileSync('server/modules/task/task-events.ts', 'utf8')
    const problemService = readFileSync('server/modules/problem/problem.service.ts', 'utf8')
    const attachments = readFileSync('server/api/attachments/index.post.ts', 'utf8')

    for (const reason of ['created', 'updated', 'started', 'progress', 'resolved', 'completed', 'returned', 'deleted']) {
      expect(service).toContain(`reason: '${reason}'`)
    }
    expect(events).toContain('administratorsForOrganization(input.actor.organizationId)')
    expect(events).toContain("type: 'task.changed'")
    expect(problemService).toContain("reason: 'created'")
    expect(problemService).toContain("reason: 'deleted'")
    expect(attachments).toContain("reason: 'progress'")
  })

  it('refreshes task lists, dashboards and opened task cards from task events', () => {
    const state = readFileSync('src/features/manage-notifications/model/notifications.ts', 'utf8')
    const work = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const dashboard = readFileSync('src/pages/dashboard/DashboardPage.vue', 'utf8')
    const detail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')

    expect(state).toContain("message.type === 'task.changed'")
    expect(state).toContain('scheduleTaskRevision(message)')
    expect(state).toContain('taskRealtime.apply(pendingTaskMessage)')
    expect(work).toContain('watch(notificationState.taskRevision')
    expect(dashboard).toContain('notificationState.taskRevision')
    expect(detail).toContain('watch(taskRealtime.revision')
    expect(detail).toContain("change?.reason === 'deleted'")
  })
})
