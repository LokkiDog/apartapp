import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/infrastructure/database/schema.ts',
  out: './server/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://aparts:aparts@localhost:55432/aparts'
  }
})
