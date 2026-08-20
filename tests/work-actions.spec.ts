import { describe, expect, it } from 'vitest'
import { cleaningActionKeys, taskActionKeys } from '../src/pages/work/model/work-actions'

describe('work action access', () => {
  it('gives an administrator management actions and keeps finished work read-only', () => {
    expect(cleaningActionKeys({ status: 'assigned', isAdministrator: true, canStock: true, canOperate: true })).toEqual(['stock', 'complete', 'edit', 'delete'])
    expect(cleaningActionKeys({ status: 'completed', isAdministrator: true, canStock: true, canOperate: true })).toEqual(['inventory', 'delete'])
    expect(taskActionKeys({ status: 'completed', isAdministrator: true, canStock: true, canOperate: true, canCancel: true })).toEqual(['delete'])
  })

  it('keeps management actions hidden from managers', () => {
    expect(cleaningActionKeys({ status: 'assigned', isAdministrator: false, canStock: true, canOperate: false })).toEqual(['stock'])
    expect(taskActionKeys({ status: 'open', isAdministrator: false, canStock: true, canOperate: false, canCancel: true })).toEqual(['stock', 'cancel'])
  })

  it('shows only operational actions to assigned workers', () => {
    expect(cleaningActionKeys({ status: 'assigned', isAdministrator: false, canStock: true, canOperate: true })).toEqual(['stock', 'complete'])
    expect(taskActionKeys({ status: 'open', isAdministrator: false, canStock: true, canOperate: true })).toEqual(['stock', 'complete'])
    expect(taskActionKeys({ status: 'canceled', isAdministrator: false, canStock: true, canOperate: true })).toEqual([])
  })
})
