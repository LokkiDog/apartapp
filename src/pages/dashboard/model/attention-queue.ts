import type { AttentionCategory, OperationsAttention, OperationsReason } from '@contracts/dashboard-operations'

export type AttentionSelection = AttentionCategory | 'all' | null
const categories: AttentionCategory[] = ['arrivals', 'assignments', 'overdue', 'review']
const priorities: AttentionCategory[] = ['arrivals', 'overdue', 'assignments', 'review']
const reasonOrder: OperationsReason[] = ['unassigned', 'unaccepted', 'guest_count', 'review', 'overdue', 'problem', 'guests_unknown', 'preparation']

export function attentionQueue(items: OperationsAttention[], selection: AttentionSelection, expanded: boolean) {
  const groups = categories.map(id => ({ id, count: items.filter(item => item.category === id).length }))
  const selected = selection ?? priorities.find(id => groups.some(group => group.id === id && group.count > 0)) ?? 'arrivals'
  const filtered = selected === 'all' ? items : items.filter(item => item.category === selected)
  const visible = expanded ? filtered : filtered.slice(0, 3)
  return { groups, selected, visible, remaining: items.length - visible.length }
}

export function primaryAttentionReason(item: OperationsAttention): OperationsReason {
  return reasonOrder.find(reason => item.reasons.includes(reason)) ?? 'preparation'
}
