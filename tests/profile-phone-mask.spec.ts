import { describe, expect, it } from 'vitest'
import { profileUpdateSchema } from '../shared/contracts/platform'
import { formatProfilePhone, maskProfilePhoneEdit } from '../src/pages/account/model/phone-mask'

describe('profile phone', () => {
  it('formats a stored +7 number and a paste without changing international or unprefixed numbers', () => {
    expect(formatProfilePhone('+79991234567')).toBe('+7 (999) 123-45-67')
    expect(maskProfilePhoneEdit('', '+79991234567', 12, 'insertFromPaste'))
      .toEqual({ value: '+7 (999) 123-45-67', cursor: 18 })
    expect(maskProfilePhoneEdit('+35', '+359', 4, 'insertText')).toEqual({ value: '+359', cursor: 4 })
    expect(formatProfilePhone('89991234567')).toBe('89991234567')
  })

  it('keeps the caret with the edited digit when typing or replacing in the middle', () => {
    expect(maskProfilePhoneEdit('+7 (991) 234-56-7', '+7 (9991) 234-56-7', 7, 'insertText'))
      .toEqual({ value: '+7 (999) 123-45-67', cursor: 7 })
    expect(maskProfilePhoneEdit('+7 (999) 123-45-67', '+7 (999) 456-45-67', 12, 'insertText'))
      .toEqual({ value: '+7 (999) 456-45-67', cursor: 12 })
  })

  it('deletes the adjacent digit when Backspace or Delete meets a separator', () => {
    const previous = '+7 (999) 123-45-67'
    const withoutDash = '+7 (999) 12345-67'
    expect(maskProfilePhoneEdit(previous, withoutDash, 12, 'deleteContentBackward'))
      .toEqual({ value: '+7 (999) 124-56-7', cursor: 11 })
    expect(maskProfilePhoneEdit(previous, withoutDash, 12, 'deleteContentForward'))
      .toEqual({ value: '+7 (999) 123-56-7', cursor: 12 })
    expect(maskProfilePhoneEdit(previous, '', 0, 'deleteContentBackward')).toEqual({ value: '', cursor: 0 })
  })

  it('requires a complete +7 number only for the profile phone', () => {
    for (const phone of ['', '+359 888 123 456', '+7 (999) 123-45-67']) {
      expect(profileUpdateSchema.safeParse({ name: 'Anna', phone }).success).toBe(true)
    }
    for (const phone of ['+7 (999) 123-45', '+799912345678']) {
      expect(profileUpdateSchema.safeParse({ name: 'Anna', phone }).success).toBe(false)
    }
  })
})
