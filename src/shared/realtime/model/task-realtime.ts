export type TaskChangeReason = 'created' | 'updated' | 'started' | 'progress' | 'resolved' | 'completed' | 'returned' | 'deleted'
export type TaskChangeMessage = { type: 'task.changed'; taskId: string; reason: TaskChangeReason; occurredAt: string }

export function useTaskRealtimeState() {
  const revision = useState('task-revision', () => 0)
  const lastChange = useState<TaskChangeMessage | null>('last-task-change', () => null)

  function apply(message: TaskChangeMessage) {
    lastChange.value = message
    revision.value += 1
  }

  return { revision, lastChange, apply }
}
