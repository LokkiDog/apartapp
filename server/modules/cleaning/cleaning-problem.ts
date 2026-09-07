import { and, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Actor } from '../../infrastructure/auth/actor'
import { attachments, cleaningProblems, financialEntries, tasks } from '../../infrastructure/database/schema'
import { administratorsForOrganization, notifyUsers } from '../../infrastructure/notification/publish'

type ProblemInput = { id: string; description: string }

export async function syncCleaningProblems(tx: any, actor: Actor, cleaningId: string, apartmentId: string, problems: ProblemInput[]) {
  const existing = await tx.select().from(cleaningProblems).where(eq(cleaningProblems.cleaningId, cleaningId))
  const requestedIds = problems.map(problem => problem.id)
  if (requestedIds.length) {
    const occupied = await tx.select({ id: cleaningProblems.id, cleaningId: cleaningProblems.cleaningId })
      .from(cleaningProblems)
      .where(inArray(cleaningProblems.id, requestedIds))
    if (occupied.some((problem: { cleaningId: string }) => problem.cleaningId !== cleaningId)) {
      throw createError({ statusCode: 400, statusMessage: 'Проблема относится к другой уборке' })
    }
  }

  const existingById = new Map<string, { id: string, description: string, resolvedAt: Date | null }>(existing.map((problem: { id: string, description: string, resolvedAt: Date | null }) => [problem.id, problem]))
  const existingIds = new Set(existingById.keys())
  for (const problem of problems) {
    if (existingIds.has(problem.id)) {
      const current = existingById.get(problem.id)!
      if (current.resolvedAt && current.description !== problem.description) throw createError({ statusCode: 409, statusMessage: 'Решённую проблему нельзя изменить из уборки' })
      await tx.update(cleaningProblems)
        .set({ description: problem.description, updatedAt: new Date() })
        .where(and(eq(cleaningProblems.id, problem.id), eq(cleaningProblems.cleaningId, cleaningId)))
    } else {
      await tx.insert(cleaningProblems).values({ id: problem.id, organizationId: actor.organizationId, apartmentId, cleaningId, description: problem.description, createdById: actor.id })
    }
  }

  const removedIds = existing.filter((problem: { id: string }) => !requestedIds.includes(problem.id)).map((problem: { id: string }) => problem.id)
  if (!removedIds.length) return [] as string[]
  if (existing.some((problem: { id: string, resolvedAt: Date | null }) => removedIds.includes(problem.id) && problem.resolvedAt)) {
    throw createError({ statusCode: 409, statusMessage: 'Решённую проблему нельзя удалить из уборки' })
  }
  const [expense, solutionTask] = await Promise.all([
    tx.select({ problemId: financialEntries.problemId }).from(financialEntries).where(inArray(financialEntries.problemId, removedIds)),
    tx.select({ problemId: tasks.problemId }).from(tasks).where(inArray(tasks.problemId, removedIds))
  ])
  const dependentIds = new Set([...expense.map((item: { problemId: string | null }) => item.problemId), ...solutionTask.map((item: { problemId: string | null }) => item.problemId)].filter(Boolean) as string[])
  if (dependentIds.size) {
    const requested = existing.filter((problem: { id: string, description: string }) => dependentIds.has(problem.id))
    await tx.update(cleaningProblems).set({ deletionRequestedAt: new Date(), deletionRequestedById: actor.id, updatedAt: new Date() }).where(inArray(cleaningProblems.id, [...dependentIds]))
    const administrators = await administratorsForOrganization(actor.organizationId)
    await Promise.all(requested.map((problem: { id: string, description: string }) => notifyUsers({ organizationId: actor.organizationId, userIds: administrators, type: 'problem', title: 'Запрошено удаление проблемы', body: problem.description, href: `/problems?problemId=${problem.id}` })))
  }
  const removableIds = removedIds.filter((id: string) => !dependentIds.has(id))
  if (!removableIds.length) return [] as string[]
  const removedAttachments = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(and(
    eq(attachments.entityType, 'cleaning_problem'),
    inArray(attachments.entityId, removableIds)
  ))
  await tx.delete(attachments).where(and(eq(attachments.entityType, 'cleaning_problem'), inArray(attachments.entityId, removableIds)))
  await tx.delete(cleaningProblems).where(inArray(cleaningProblems.id, removableIds))
  return removedAttachments.map((attachment: { storageKey: string }) => attachment.storageKey)
}

export function cleaningProblemSummary(problems: ProblemInput[]) {
  return problems.map(problem => problem.description.trim()).filter(Boolean).join('\n')
}

export function resolveCleaningProblems(input: unknown, data: { hasProblem: boolean; problemDescription: string; problems: ProblemInput[] }, existing: ProblemInput[]) {
  const hasProblemsField = Boolean(input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'problems'))
  if (hasProblemsField) return data.problems
  if (!data.hasProblem || !data.problemDescription.trim()) return []
  if (!existing.length) return [{ id: randomUUID(), description: data.problemDescription.trim() }]
  return [{ id: existing[0]!.id, description: data.problemDescription.trim() }, ...existing.slice(1)]
}
