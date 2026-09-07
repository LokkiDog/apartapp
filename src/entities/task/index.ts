export type Task = {
  id: string
  apartmentId: string
  assigneeId: string | null
  problemId?: string | null
  title: string
  description: string
  priority: string
  status: string
  dueOn: string | null
  ownerCostEur?: number
  checklist: Array<{ label: string; checked: boolean }>
  comment: string
  hasProblem: boolean
  problemDescription: string
  completedAt: string | null
  assignee?: { id: string; name: string } | null
  apartment: { name: string; managers: Array<{ id: string; name: string }>; hotel: { name: string; address: string; latitude: string; longitude: string } }
}
