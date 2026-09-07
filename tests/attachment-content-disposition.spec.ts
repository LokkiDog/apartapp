import { describe, expect, it } from 'vitest'
import { inlineContentDisposition } from '../server/modules/attachment/content-disposition'

describe('attachment content disposition', () => {
  it('keeps the HTTP header ASCII-safe and preserves a Cyrillic filename', () => {
    const header = inlineContentDisposition('Клифар App.jpg')

    expect(header).toBe('inline; filename="______ App.jpg"; filename*=UTF-8\'\'%D0%9A%D0%BB%D0%B8%D1%84%D0%B0%D1%80%20App.jpg')
    expect([...header].every(character => character.charCodeAt(0) <= 0x7f)).toBe(true)
  })

  it('escapes quotes and backslashes in the fallback filename', () => {
    expect(inlineContentDisposition('photo"\\.jpg')).toContain('filename="photo__.jpg"')
  })
})
