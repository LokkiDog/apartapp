import { z } from 'zod'
export const releaseSeenSchema = z.object({ version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}$/) }).strict()
export interface ReleaseAnnouncementState { version: string | null; seen: boolean }
