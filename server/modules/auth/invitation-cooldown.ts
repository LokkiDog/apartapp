export const INVITATION_RESEND_COOLDOWN_MS = 30_000

export function invitationResendAvailableAt(sentAt: Date) {
  return new Date(sentAt.getTime() + INVITATION_RESEND_COOLDOWN_MS)
}

export function invitationResendWaitSeconds(sentAt: Date, now = new Date()) {
  return Math.max(0, Math.ceil((invitationResendAvailableAt(sentAt).getTime() - now.getTime()) / 1000))
}
