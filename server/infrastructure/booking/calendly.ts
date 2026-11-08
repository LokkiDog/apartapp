import { createError } from 'h3'
import { z } from 'zod'

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const eventSchema = z.object({
  resource: z.object({
    uri: z.string(), name: z.string().min(1).max(200), status: z.string(),
    start_time: z.iso.datetime({ offset: true }), end_time: z.iso.datetime({ offset: true }),
    location: z.object({ type: z.string(), join_url: z.string().nullable().optional() }).nullable().optional()
  })
})
const inviteeSchema = z.object({
  resource: z.object({ uri: z.string(), event: z.string(), status: z.string(), timezone: z.string().nullable().optional() })
})

function reference(uri: string) {
  try {
    const url = new URL(uri)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null
    const prefix = url.hostname === 'api.calendly.com' ? '(?:/api/v2)?' : url.hostname === 'calendly.com' ? '/api/v2' : null
    if (prefix === null) return null
    const match = url.pathname.match(new RegExp('^' + prefix + '/scheduled_events/(' + uuid + ')(?:/invitees/(' + uuid + '))?$', 'i'))
    return match ? { eventId: match[1]!.toLowerCase(), inviteeId: match[2]?.toLowerCase() } : null
  } catch { return null }
}

async function calendlyGet(path: string, token: string) {
  let response: Response
  try {
    // Paths are built from validated UUIDs, never from a client-supplied URL.
    response = await fetch('https://api.calendly.com' + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': 'MagicMop/1.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    })
  } catch { throw createError({ statusCode: 503, message: 'Meeting details unavailable' }) }
  if (response.status === 404) throw createError({ statusCode: 404, message: 'Meeting not found' })
  if (!response.ok) throw createError({ statusCode: 503, message: 'Meeting details unavailable' })
  try { return await response.json() as unknown } catch { throw createError({ statusCode: 503, message: 'Meeting details unavailable' }) }
}

export async function getBookingCalendar(eventId: string, inviteeId: string, token: string, eventName: string) {
  if (!token) throw createError({ statusCode: 503, message: 'Meeting calendar is not configured' })
  const [eventData, inviteeData] = await Promise.all([
    calendlyGet('/scheduled_events/' + eventId, token),
    calendlyGet('/scheduled_events/' + eventId + '/invitees/' + inviteeId, token)
  ])
  const eventResult = eventSchema.safeParse(eventData)
  const inviteeResult = inviteeSchema.safeParse(inviteeData)
  if (!eventResult.success || !inviteeResult.success) throw createError({ statusCode: 503, message: 'Meeting details unavailable' })
  const event = eventResult.data.resource
  const invitee = inviteeResult.data.resource
  const eventRef = reference(event.uri)
  const inviteeRef = reference(invitee.uri)
  const inviteeEvent = reference(invitee.event)
  if (event.name !== eventName || eventRef?.eventId !== eventId || eventRef.inviteeId ||
      inviteeRef?.eventId !== eventId || inviteeRef.inviteeId !== inviteeId ||
      inviteeEvent?.eventId !== eventId || inviteeEvent.inviteeId) {
    throw createError({ statusCode: 404, message: 'Meeting not found' })
  }
  if (event.status !== 'active' || invitee.status !== 'active') throw createError({ statusCode: 410, message: 'Meeting no longer active' })
  if (Date.parse(event.end_time) <= Date.parse(event.start_time)) throw createError({ statusCode: 503, message: 'Meeting details unavailable' })
  let joinUrl: string | null = null
  if (event.location?.type === 'zoom' && event.location.join_url) {
    try {
      const url = new URL(event.location.join_url)
      const isZoom = ['zoom.us', 'zoom.com', 'zoomgov.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))
      if (!isZoom || url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Invalid meeting URL')
      joinUrl = url.toString()
    } catch { throw createError({ statusCode: 503, message: 'Meeting details unavailable' }) }
  }
  let timeZone = invitee.timezone || 'UTC'
  try { new Intl.DateTimeFormat('ru-RU', { timeZone }).format() } catch { timeZone = 'UTC' }
  // No invitee PII, management links, host credentials or internal notes leave the server.
  return {
    title: event.name,
    startTime: event.start_time,
    endTime: event.end_time,
    timeZone,
    joinUrl,
    uid: 'magicmop-demo-' + eventId + '@magicmopcrm.com'
  }
}
