import type { Task } from '#fsd/entities/task'

export type TaskStatusFilter = 'all' | 'open' | 'in_progress'
export type TaskSort = 'priority-desc' | 'priority-asc' | 'due-asc' | 'due-desc'

const finalStatuses = new Set(['completed', 'canceled'])
const priorityWeight: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 }

function compareText(left: Task, right: Task) {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
}

function compareDueOn(left: Task, right: Task, direction: 1 | -1) {
  if (!left.dueOn && !right.dueOn) return 0
  if (!left.dueOn) return 1
  if (!right.dueOn) return -1
  return left.dueOn.localeCompare(right.dueOn) * direction
}

function comparePriority(left: Task, right: Task, direction: 1 | -1) {
  return ((priorityWeight[left.priority] ?? 0) - (priorityWeight[right.priority] ?? 0)) * direction
}

export function isFinalTask(task: Task) {
  return finalStatuses.has(task.status)
}

export function currentTasks(tasks: Task[]) {
  return tasks.filter(task => !isFinalTask(task))
}

export function historyTasks(tasks: Task[]) {
  return tasks.filter(isFinalTask).sort((left, right) => {
    const leftTime = left.status === 'completed' ? left.completedAt ?? left.updatedAt : left.updatedAt
    const rightTime = right.status === 'completed' ? right.completedAt ?? right.updatedAt : right.updatedAt
    return rightTime.localeCompare(leftTime) || compareText(left, right)
  })
}

export function filterAndSortCurrentTasks(tasks: Task[], status: TaskStatusFilter, sort: TaskSort) {
  return currentTasks(tasks).filter(task => status === 'all' || task.status === status).sort((left, right) => {
    const bySort = sort === 'priority-desc'
      ? comparePriority(left, right, -1) || compareDueOn(left, right, 1)
      : sort === 'priority-asc'
        ? comparePriority(left, right, 1) || compareDueOn(left, right, 1)
        : sort === 'due-asc'
          ? compareDueOn(left, right, 1) || comparePriority(left, right, -1)
          : compareDueOn(left, right, -1) || comparePriority(left, right, -1)
    return bySort || compareText(left, right)
  })
}
