function russianPhoneDigits(value: string) {
  return /^\+7[\d\s()-]*$/.test(value) ? value.replace(/\D/g, '') : null
}

export function formatProfilePhone(value: string) {
  const digits = russianPhoneDigits(value)
  if (!digits || digits.length > 11) return value
  if (digits.length === 1) return '+7'

  const area = digits.slice(1, 4)
  const first = digits.slice(4, 7)
  const second = digits.slice(7, 9)
  const last = digits.slice(9)
  return `+7 (${area}${area.length === 3 ? ')' : ''}${first ? ` ${first}` : ''}${second ? `-${second}` : ''}${last ? `-${last}` : ''}`
}

export function maskProfilePhoneEdit(previous: string, value: string, cursor: number, inputType: string) {
  let digits = russianPhoneDigits(value)
  if (!digits || digits.length > 11) return { value, cursor }

  let before = value.slice(0, cursor).replace(/\D/g, '').length
  // Native deletion can remove only a separator. Delete the adjacent digit in that direction.
  if (digits === russianPhoneDigits(previous) && (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward')) {
    const index = inputType === 'deleteContentBackward' ? before - 1 : before
    if (index >= 1 && index < digits.length) {
      digits = digits.slice(0, index) + digits.slice(index + 1)
      before = index
    }
  }

  const formatted = formatProfilePhone('+' + digits)
  let nextCursor = cursor === value.length ? formatted.length : 0
  if (!nextCursor && before > 0) {
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i]!) && --before === 0) {
        nextCursor = i + 1
        break
      }
    }
  }
  return { value: formatted, cursor: nextCursor }
}
