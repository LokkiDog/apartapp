import type { Actor } from './actor'
import { AUTH_SESSION_IDLE_MAX_AGE_SECONDS } from '../../../shared/config/auth-session'

export async function refreshUserSession(event: Parameters<typeof setUserSession>[0], actor: Actor) {
  await replaceUserSession(event, { user: actor }, { maxAge: AUTH_SESSION_IDLE_MAX_AGE_SECONDS })
}
