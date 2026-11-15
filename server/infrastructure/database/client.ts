import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

import { crmDatabaseUrl } from '../../../shared/config/crm-database'

const connectionString = crmDatabaseUrl(process.env.CRM_BRAND, process.env.DATABASE_URL)

const globalForDatabase = globalThis as unknown as { apartsSql?: ReturnType<typeof postgres> }
const sql = globalForDatabase.apartsSql ?? postgres(connectionString, { max: 10 })

if (process.env.NODE_ENV !== 'production') globalForDatabase.apartsSql = sql

export const db = drizzle(sql, { schema })
export { sql }
