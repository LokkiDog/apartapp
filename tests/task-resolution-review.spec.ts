import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { taskStatusSchema } from '../shared/contracts/crm'

describe('task resolution review workflow', () => {
  it('adds the resolved status and keeps the database active-task guard aligned', () => {
    const migration = readFileSync('server/infrastructure/database/migrations/0037_task_resolution_review.sql', 'utf8')
    expect(taskStatusSchema.parse('resolved')).toBe('resolved')
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'resolved'")
    expect(migration).toContain('"status" NOT IN (\'completed\', \'canceled\')')
    expect(migration).not.toContain('"status" IN (\'open\', \'in_progress\', \'resolved\')')
    expect(migration).not.toContain('UPDATE "tasks"')
  })

  it('separates executor resolution from administrator financial closure', () => {
    const service = readFileSync('server/modules/task/task.service.ts', 'utf8')
    expect(service).toContain("status: 'resolved'")
    expect(service).toContain('export async function closeTask')
    expect(service).toContain("if (task.status !== 'resolved')")
    expect(service).toContain("status: 'completed'")
    expect(service).toContain("action: 'task.resolved'")
    expect(service).toContain("action: 'task.closed'")
    expect(service).toContain("action: 'task.returned_to_work'")
    expect(service).toContain("type: 'task_resolved'")
    expect(service).toContain("type: 'task_returned'")
  })

  it('keeps resolved tasks reviewable and visually distinct only for administrators', () => {
    const detail = readFileSync('src/features/work-detail/ui/WorkDetailPage.vue', 'utf8')
    const page = readFileSync('src/pages/work/WorkPage.vue', 'utf8')
    const problemService = readFileSync('server/modules/problem/problem.service.ts', 'utf8')
    expect(detail).toContain("task.value?.status === 'resolved' && isAdministrator.value")
    expect(detail).toContain('/return-to-work')
    expect(detail).toContain('/close')
    expect(page).toContain("'work-task-row--resolved': isAdministrator && task.status === 'resolved'")
    expect(page).toContain('value: "resolved"')
    expect(problemService).toContain("['open', 'in_progress', 'resolved']")
  })
})
