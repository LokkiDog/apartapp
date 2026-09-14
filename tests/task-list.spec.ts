import { describe, expect, it } from 'vitest'
import type { Task } from '../src/entities/task'
import { currentTasks, filterAndSortCurrentTasks, historyTasks } from '../src/pages/work/model/task-list'

function task(overrides: Partial<Task> = {}): Task {
  return { id: 'task-1', apartmentId: 'apartment-1', assigneeId: null, title: 'Task', description: '', priority: 'normal', status: 'open', dueOn: null, ownerCostEur: 0, checklist: [], comment: '', hasProblem: false, problemDescription: '', problemDetails: '', completedAt: null, updatedAt: '2026-09-01T10:00:00.000Z', apartment: { name: 'A1', managers: [], hotel: { name: 'Hotel', address: '', latitude: '', longitude: '' } }, ...overrides }
}

describe('task list', () => {
  const tasks = [
    task({ id: 'open-normal', title: 'Beta', status: 'open', priority: 'normal', dueOn: '2026-09-12' }),
    task({ id: 'progress-urgent', title: 'Alpha', status: 'in_progress', priority: 'urgent', dueOn: '2026-09-20' }),
    task({ id: 'open-high-undated', title: 'Gamma', status: 'open', priority: 'high' }),
    task({ id: 'completed', status: 'completed', completedAt: '2026-09-14T10:00:00.000Z' }),
    task({ id: 'canceled', status: 'canceled', updatedAt: '2026-09-15T10:00:00.000Z' }),
  ]

  it('separates active tasks from completed and canceled history', () => {
    expect(currentTasks(tasks).map(item => item.id)).toEqual(['open-normal', 'progress-urgent', 'open-high-undated'])
    expect(historyTasks(tasks).map(item => item.id)).toEqual(['canceled', 'completed'])
  })

  it('filters the current list by status', () => {
    expect(filterAndSortCurrentTasks(tasks, 'open', 'priority-desc').map(item => item.id)).toEqual(['open-high-undated', 'open-normal'])
    expect(filterAndSortCurrentTasks(tasks, 'in_progress', 'priority-desc').map(item => item.id)).toEqual(['progress-urgent'])
  })

  it('sorts every supported order and keeps undated tasks after dated tasks', () => {
    expect(filterAndSortCurrentTasks(tasks, 'all', 'priority-desc').map(item => item.id)).toEqual(['progress-urgent', 'open-high-undated', 'open-normal'])
    expect(filterAndSortCurrentTasks(tasks, 'all', 'priority-asc').map(item => item.id)).toEqual(['open-normal', 'open-high-undated', 'progress-urgent'])
    expect(filterAndSortCurrentTasks(tasks, 'all', 'due-asc').map(item => item.id)).toEqual(['open-normal', 'progress-urgent', 'open-high-undated'])
    expect(filterAndSortCurrentTasks(tasks, 'all', 'due-desc').map(item => item.id)).toEqual(['progress-urgent', 'open-normal', 'open-high-undated'])
  })
})
