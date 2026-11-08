import { createError, defineEventHandler, getHeader, getMethod, getRequestURL, setHeader } from 'h3'

// Mutation endpoints use the session cookie; reject cross-origin browser
// requests before dispatch and prevent protected responses entering caches.
export default defineEventHandler(event => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  setHeader(event, 'cache-control', 'private, no-store')
  // This token-only public endpoint validates its own narrow CORS policy.
  if (path === '/api/public/booking/verify' && ['POST', 'OPTIONS'].includes(getMethod(event))) return
  if (['GET', 'HEAD', 'OPTIONS'].includes(getMethod(event))) return
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  if (getHeader(event, 'sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== host)) {
    throw createError({ statusCode: 403, statusMessage: 'Недопустимый источник запроса' })
  }
})
