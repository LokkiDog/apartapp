import { spawn } from 'node:child_process'
import { crmDatabaseUrl } from '../shared/config/crm-database'
import { loadCrmEnv } from '../shared/config/load-crm-env'

const args = process.argv.slice(2)
const aparts = args[0] === '--aparts'
if (aparts) args.shift()
const envFile = aparts ? '.env.aparts' : process.env.CRM_ENV_FILE || '.env'

try {
  loadCrmEnv(envFile)
  const brand = process.env.CRM_BRAND || 'aparts'
  if (aparts && brand !== 'aparts') throw new Error('The Aparts development profile requires CRM_BRAND=aparts.')
  const databaseUrl = crmDatabaseUrl(brand, process.env.DATABASE_URL)
  const target = new URL(databaseUrl)
  console.log(`CRM ${brand} · PostgreSQL ${target.host}${target.pathname}`)
  const port = brand === 'magicmop' ? '2002' : '2000'
  const child = spawn(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--dotenv', envFile, '--port', port, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CRM_BRAND: brand,
      DATABASE_URL: databaseUrl,
      ...(aparts ? { APARTS_DEV_BUILD_DIR: '.nuxt-aparts' } : {})
    }
  })
  const forwardInterrupt = () => child.kill('SIGINT')
  const forwardTermination = () => child.kill('SIGTERM')
  process.on('SIGINT', forwardInterrupt)
  process.on('SIGTERM', forwardTermination)
  child.on('exit', code => {
    process.off('SIGINT', forwardInterrupt)
    process.off('SIGTERM', forwardTermination)
    process.exitCode = code ?? 1
  })
  child.on('error', error => {
    console.error(error.message)
    process.exitCode = 1
  })
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Could not start CRM.')
  process.exitCode = 1
}
