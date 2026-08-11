import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL || 'postgres://aparts:aparts@localhost:55432/aparts'

const globalForDatabase = globalThis as unknown as { apartsSql?: ReturnType<typeof postgres> }
const sql = globalForDatabase.apartsSql ?? postgres(connectionString, { max: 10 })

if (process.env.NODE_ENV !== 'production') globalForDatabase.apartsSql = sql

export const db = drizzle(sql, { schema })
export { sql }
