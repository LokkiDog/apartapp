import { sql } from '../infrastructure/database/client'

export default defineEventHandler(async () => {
  await sql`select 1`
  return { status: 'ok' }
})
