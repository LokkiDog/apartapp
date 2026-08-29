import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../infrastructure/database/client'
import { cleanings, stays } from '../../infrastructure/database/schema'

export function hasCleaningUrgency(departureExists: boolean, arrivalExists: boolean) {
  return departureExists && arrivalExists
}

export async function calculateCleaningUrgency(organizationId: string, apartmentId: string, date: string) {
  const [departure, arrival] = await Promise.all([
    db.query.stays.findFirst({ where: and(eq(stays.organizationId, organizationId), eq(stays.apartmentId, apartmentId), eq(stays.checkOutOn, date)) }),
    db.query.stays.findFirst({ where: and(eq(stays.organizationId, organizationId), eq(stays.apartmentId, apartmentId), eq(stays.checkInOn, date)) })
  ])
  return hasCleaningUrgency(Boolean(departure), Boolean(arrival))
}

export async function refreshAutomaticCleaningUrgency(organizationId: string, apartmentId: string, dates: string[]) {
  const uniqueDates = [...new Set(dates)]
  if (!uniqueDates.length) return
  const rows = await db.query.cleanings.findMany({ where: and(eq(cleanings.organizationId, organizationId), eq(cleanings.apartmentId, apartmentId), inArray(cleanings.scheduledOn, uniqueDates), isNull(cleanings.urgencyOverride)) })
  for (const cleaning of rows) {
    const isUrgent = await calculateCleaningUrgency(organizationId, apartmentId, cleaning.scheduledOn)
    if (cleaning.isUrgent !== isUrgent) await db.update(cleanings).set({ isUrgent, updatedAt: new Date() }).where(eq(cleanings.id, cleaning.id))
  }
}
