export type Task = {
  id: string
  apartmentId: string
  assigneeId: string | null
  problemId?: string | null
  category: 'general' | 'cash'
  title: string
  description: string
  priority: string
  status: string
  dueOn: string | null
  ownerCostEur: number
  checklist: Array<{ label: string; checked: boolean }>
  comment: string
  hasProblem: boolean
  problemDescription: string
  problemDetails: string
  completedAt: string | null
  cash?: {
    expectedAmountEur: number
    collectedAmountEur: number | null
    collectedById: string | null
    collectedAt: string | null
    receivedAmountEur: number | null
    receivedById: string | null
    receivedAt: string | null
    reportIncluded: boolean
    reportOccurredOn: string | null
  } | null
  updatedAt: string
  assignee?: { id: string; name: string } | null
  apartment: { name: string; managers: Array<{ id: string; name: string }>; hotel: { name: string; address: string; latitude: string; longitude: string } }
}
