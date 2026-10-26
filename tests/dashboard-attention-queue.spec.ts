import { describe, expect, it } from 'vitest'
import type { AttentionCategory, OperationsAttention } from '../shared/contracts/dashboard-operations'
import { attentionQueue, primaryAttentionReason } from '../src/pages/dashboard/model/attention-queue'

function record(category: AttentionCategory, id: string): OperationsAttention {
  return { id, category, apartment: { name: id, hotel: { name: 'Hotel' } }, date: '2026-10-26', title: null, reasons: ['preparation'], href: '/work', arrivalToday: category === 'arrivals', assigneeNames: [], preparation: null, action: { kind: 'open', href: '/work' } }
}
const items = [record('arrivals', 'arrival-1'), record('arrivals', 'arrival-2'), record('arrivals', 'arrival-3'), record('arrivals', 'arrival-4'), record('overdue', 'late'), record('assignments', 'unassigned'), record('review', 'review')]

describe('attention queue navigation', () => {
  it('starts with three arrivals and exposes counts and a way to see every hidden record', () => {
    const queue = attentionQueue(items, null, false)
    expect(queue.selected).toBe('arrivals')
    expect(queue.visible.map(item => item.id)).toEqual(['arrival-1', 'arrival-2', 'arrival-3'])
    expect(queue.remaining).toBe(4)
    expect(queue.groups).toEqual([{ id: 'arrivals', count: 4 }, { id: 'assignments', count: 1 }, { id: 'overdue', count: 1 }, { id: 'review', count: 1 }])
    expect(attentionQueue(items, 'all', true).visible.map(item => item.id)).toEqual(['arrival-1', 'arrival-2', 'arrival-3', 'arrival-4', 'late', 'unassigned', 'review'])
    expect(attentionQueue(items, 'all', true).remaining).toBe(0)
  })
  it('switches categories without mixing records and keeps an explicitly selected empty group', () => {
    expect(attentionQueue(items, 'review', false).visible.map(item => item.id)).toEqual(['review'])
    const refreshed = items.filter(item => item.category !== 'review')
    expect(attentionQueue(refreshed, 'review', false).visible).toEqual([])
    expect(attentionQueue(refreshed, 'review', false).remaining).toBe(6)
    expect(attentionQueue(refreshed, null, false).selected).toBe('arrivals')
  })
  it('prioritizes overdue work when there are no arrivals and does not duplicate multi-reason records', () => {
    const multiReason = { ...record('arrivals', 'multi'), reasons: ['preparation', 'unassigned', 'overdue'] as const }
    const queue = attentionQueue([{ ...multiReason, reasons: [...multiReason.reasons] }, record('overdue', 'late')], null, false)
    expect(queue.groups.map(group => group.count)).toEqual([1, 0, 1, 0])
    expect(primaryAttentionReason({ ...multiReason, reasons: [...multiReason.reasons] })).toBe('unassigned')
    expect(attentionQueue(items.filter(item => item.category !== 'arrivals'), null, false).selected).toBe('overdue')
    expect(attentionQueue([], null, false).visible).toEqual([])
  })
})
