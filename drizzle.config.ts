import { defineConfig } from 'drizzle-kit'
import { crmDatabaseUrl } from './shared/config/crm-database'
import { loadCrmEnv } from './shared/config/load-crm-env'

loadCrmEnv()

export default defineConfig({
  schema: './server/infrastructure/database/schema.ts',
  out: './server/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: crmDatabaseUrl(process.env.CRM_BRAND || process.env.CRM_DEPLOY_BRAND, process.env.DATABASE_URL)
  }
})
