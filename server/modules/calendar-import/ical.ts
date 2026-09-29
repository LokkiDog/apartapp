import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface IcalEvent {
  uid: string
  checkInOn: string
  checkOutOn: string
  summary: string
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number)
    const [a, b] = octets
    return a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127)
  }
  const normalized = address.toLowerCase()
  if (isIP(normalized) !== 6) return true
  const firstHextet = Number.parseInt(normalized.split(':', 1)[0] || '0', 16)
  return (firstHextet & 0xe000) !== 0x2000 || normalized.startsWith('2001:db8:')
}

async function validateFeedUrl(rawUrl: string) {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('Некорректная ссылка календаря') }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Для календаря нужна публичная HTTPS-ссылка')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Ссылка календаря ведёт на недоступный адрес')
  return url
}

export async function fetchIcal(rawUrl: string) {
  let url = await validateFeedUrl(rawUrl)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirects === 3) throw new Error('Слишком много перенаправлений календаря')
      url = await validateFeedUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`Календарь вернул HTTP ${response.status}`)
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > 2_000_000) throw new Error('Файл календаря слишком большой')
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > 2_000_000) throw new Error('Файл календаря слишком большой')
    return parseIcal(text)
  }
  throw new Error('Не удалось загрузить календарь')
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!match) return null
  const date = `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(`${date}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

function unescapeText(value: string) {
  return value.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

export function parseIcal(content: string): IcalEvent[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events: IcalEvent[] = []
  let current: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }
    if (line === 'END:VEVENT') {
      if (current && current.STATUS?.toUpperCase() !== 'CANCELLED') {
        const uid = current.UID?.trim()
        const checkInOn = parseDate(current.DTSTART ?? '')
        const checkOutOn = parseDate(current.DTEND ?? '')
        if (uid && checkInOn && checkOutOn && checkOutOn > checkInOn) events.push({ uid, checkInOn, checkOutOn, summary: unescapeText(current.SUMMARY ?? '') })
      }
      current = null
      continue
    }
    if (!current) continue
    const separator = line.indexOf(':')
    if (separator < 1) continue
    const key = line.slice(0, separator).split(';', 1)[0]!.toUpperCase()
    if (['UID', 'DTSTART', 'DTEND', 'SUMMARY', 'STATUS'].includes(key)) current[key] = line.slice(separator + 1)
  }
  return [...new Map(events.map(event => [event.uid, event])).values()]
}
