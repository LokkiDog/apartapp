import { requirePrincipal } from '../../infrastructure/auth/platform'
export default defineEventHandler(async (event) => {
  const actor = await requirePrincipal(event, false)
  if (
    actor.isSuperuser &&
    !actor.inSystem &&
    getHeader(event, 'x-client-context') !==
      `${actor.organizationId}:${actor.contextRevision}`
  )
    throw createError({
      statusCode: 409,
      statusMessage: 'Контекст клиента изменился',
      data: { code: 'CLIENT_CONTEXT_CHANGED' },
    })
  return {
    enabled:
      !actor.inSystem &&
      actor.organizationStatus === 'active' &&
      actor.roles.includes('administrator') &&
      Boolean(actor.messagingEnabled),
  }
})
