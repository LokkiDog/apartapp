import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hasAcceptedCleaning } from '../server/modules/cleaning/cleaning-acceptance'

describe('cleaning assignment acceptance', () => {
  it('considers a shared cleaning accepted after any assigned worker confirms it', () => {
    expect(hasAcceptedCleaning({ assignments: [{ acceptedAt: null }, { acceptedAt: null }] })).toBe(false)
    expect(hasAcceptedCleaning({ assignments: [{ acceptedAt: null }, { acceptedAt: new Date('2026-09-06T10:00:00Z') }] })).toBe(true)
  })

  it('keeps acceptance per assignment and gates every cleaner operation on the server', () => {
    const cleaningService = readFileSync('server/modules/cleaning/cleaning.service.ts', 'utf8')
    const inventoryService = readFileSync('server/modules/inventory/inventory.service.ts', 'utf8')
    const attachmentUpload = readFileSync('server/api/attachments/index.post.ts', 'utf8')
    const acceptEndpoint = readFileSync('server/api/cleanings/[id]/accept.post.ts', 'utf8')

    expect(cleaningService).toContain("action: 'cleaning.accepted'")
    expect(cleaningService).toContain('eq(cleaningAssignments.cleanerId, actor.id)')
    expect(cleaningService).toContain("statusMessage: 'Уборка не назначена вам'")
    expect(cleaningService).toContain('acceptedAt: cleaning.assignments.find')
    expect(cleaningService.match(/requireAcceptedCleaningAssignment\(actor, cleaningId\)/g)?.length).toBe(3)
    expect(inventoryService).toContain('await requireAcceptedCleaningAssignment(actor, cleaningId)')
    expect(inventoryService).toContain('await requireAcceptedCleaningAssignment(actor, data.sourceId)')
    expect(attachmentUpload).toContain('await requireAcceptedCleaningAssignment(actor, problem.cleaningId)')
    expect(acceptEndpoint).toContain('acceptCleaning')
  })
})
