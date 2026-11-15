import { crmDatabaseUrl } from '../../shared/config/crm-database'

export default defineNitroPlugin(() => {
  const brand = useRuntimeConfig().public.brand.id
  if (process.env.CRM_BRAND !== undefined && process.env.CRM_BRAND !== brand) {
    throw new Error('CRM_BRAND does not match the built CRM brand.')
  }
  crmDatabaseUrl(brand, process.env.DATABASE_URL)
})
