import type { Actor } from './actor'
import { getSession } from 'h3'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from '../../../shared/config/auth-session'

export async function refreshUserSession(event: Parameters<typeof setUserSession>[0], actor: Actor) {
  // Initialize through auth-utils so its cookie name and password are used.
  await getUserSession(event)
  const session = await getSession(event, {
    ...useRuntimeConfig(event).session,
    maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS
  })
  // Replacing clears h3's request cache, then re-reads the original cookie,
  // including its old createdAt. Update the loaded session instead.
  session.createdAt = Date.now()
  // auth-utils merges arrays and missing properties with previous data.
  // Replace the principal so old roles and tenant metadata cannot survive.
  delete session.data.user
  await setUserSession(event, { user: actor }, { maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS })
}
