import { and, eq, ne } from 'drizzle-orm'
import type { MessagingAutomation } from '../../../shared/contracts/messaging-automation'
import type { MessagingChannel } from '../../../shared/contracts/messaging'
import type { db } from '../../infrastructure/database/client'
import { messagingConversations, messagingMessages, messagingOutbox } from '../../infrastructure/database/schema'
import { awayPeriod } from './working-hours'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function queueAutomaticReply(
  tx: Transaction,
  conversation: typeof messagingConversations.$inferSelect,
  incoming: typeof messagingMessages.$inferSelect,
  channel: MessagingChannel,
  settings: MessagingAutomation,
  timezone: string,
) {
  const { welcome, away } = settings[channel]
  const { organizationId, id: conversationId } = conversation
  const scope = and(
    eq(messagingMessages.conversationId, conversationId),
    eq(messagingMessages.organizationId, organizationId),
  )
  const texts: string[] = []
  if (welcome.enabled) {
    const [previous] = await tx.select({ id: messagingMessages.id }).from(messagingMessages).where(and(
      scope, eq(messagingMessages.direction, 'incoming'), ne(messagingMessages.id, incoming.id),
    )).limit(1)
    if (!previous) texts.push(welcome.text)
  }
  const period = away.enabled ? awayPeriod(new Date(), timezone, settings) : null
  const sendAway = period && (!conversation.lastAwayPeriod || period > conversation.lastAwayPeriod)
  if (sendAway) texts.push(away.text)
  if (!texts.length) return

  const [message] = await tx.insert(messagingMessages).values({
    organizationId, conversationId,
    direction: 'outgoing',
    status: 'pending',
    text: texts.join('\n\n'),
    automated: true,
  }).returning({ id: messagingMessages.id })
  await tx.insert(messagingOutbox).values({ organizationId, messageId: message!.id })
  await tx.update(messagingConversations).set({
    lastAwayPeriod: sendAway ? period : undefined,
    lastMessageAt: new Date(),
  }).where(and(
    eq(messagingConversations.id, conversationId),
    eq(messagingConversations.organizationId, organizationId),
  ))
}
