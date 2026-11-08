import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = realpathSync(
  mkdtempSync(join(tmpdir(), 'aparts-compose-check-')),
)
const files = [
  'docker-compose.prod.yml',
  'docker-compose.prod.services.yml',
  'docker-compose.magicmop.yml',
  'docker-compose.magicmop.services.yml',
]
const values = {
  POSTGRES_DB: 'compose_check',
  POSTGRES_USER: 'compose_check',
  POSTGRES_PASSWORD: 'compose_check_password',
  DATABASE_URL:
    'postgres://compose_check:compose_check_password@postgres:5432/compose_check',
  NUXT_PUBLIC_APP_URL: 'https://crm.example.test',
  NUXT_SESSION_PASSWORD:
    'compose-check-session-password-at-least-32-characters',
  NUXT_VAPID_SUBJECT: 'mailto:admin@example.test',
  NUXT_VAPID_PUBLIC_KEY: 'compose-check-public-key',
  NUXT_VAPID_PRIVATE_KEY: 'compose-check-private-key',
  NUXT_PUBLIC_VAPID_PUBLIC_KEY: 'compose-check-public-key',
  NUXT_MESSAGING_ENCRYPTION_KEY: 'a'.repeat(64),
}
const environment = { ...process.env }
for (const key of [
  ...Object.keys(values),
  'APARTS_ENV_FILE',
  'CRM_DEPLOY_BRAND',
  'COMPOSE_FILE',
  'COMPOSE_PROJECT_NAME',
  'COMPOSE_PROFILES',
  'COMPOSE_ENV_FILES',
  'COMPOSE_DISABLE_ENV_FILE',
])
  delete environment[key]

function writeEnvironment(name, entries) {
  writeFileSync(
    join(directory, name),
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  )
}

function configuration(args = [], overrides = {}) {
  const result = execFileSync(
    'docker',
    ['compose', ...args, '--profile', 'tools', 'config', '--format', 'json'],
    {
      cwd: directory,
      env: { ...environment, ...overrides },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return JSON.parse(result)
}

function checkModel(model, instance, expectedValues = values) {
  assert.equal(model.name, instance)
  const { app, postgres, migrate, guest } = model.services
  assert.equal(postgres.environment.POSTGRES_DB, expectedValues.POSTGRES_DB)
  assert.equal(postgres.environment.POSTGRES_USER, expectedValues.POSTGRES_USER)
  assert.equal(
    postgres.environment.POSTGRES_PASSWORD,
    expectedValues.POSTGRES_PASSWORD,
  )
  assert.equal(app.environment.DATABASE_URL, expectedValues.DATABASE_URL)
  assert.equal(migrate.environment.DATABASE_URL, app.environment.DATABASE_URL)
  assert.equal(
    app.environment.NUXT_MESSAGING_ENCRYPTION_KEY,
    expectedValues.NUXT_MESSAGING_ENCRYPTION_KEY,
  )
  for (const key of [
    'NUXT_VAPID_SUBJECT',
    'NUXT_VAPID_PUBLIC_KEY',
    'NUXT_VAPID_PRIVATE_KEY',
    'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
  ]) {
    assert.equal(app.environment[key], expectedValues[key])
  }
  assert.equal(app.build.context, directory)
  assert.equal(app.build.target, 'runtime')
  assert.equal(migrate.build.target, 'migrate')
  assert.equal(app.build.args.CRM_APP_URL, expectedValues.NUXT_PUBLIC_APP_URL)
  assert.equal(
    app.environment.NUXT_PUBLIC_APP_URL,
    expectedValues.NUXT_PUBLIC_APP_URL,
  )
  assert.equal(app.build.args.CRM_BRAND, instance)
  assert.deepEqual(
    app.ports.map((port) => [port.host_ip, port.published, port.target]),
    [['127.0.0.1', instance === 'aparts' ? '3000' : '3002', 3000]],
  )
  assert.equal(model.volumes.postgres_data.name, `${instance}_postgres_data`)
  assert.equal(model.volumes.uploads_data.name, `${instance}_uploads_data`)
  assert.equal(app.volumes[0].source, 'uploads_data')
  assert.deepEqual(migrate.profiles, ['tools'])
  if (instance === 'magicmop') {
    assert.equal(postgres.ports?.length ?? 0, 0)
    assert.equal(guest, undefined)
  } else {
    assert.deepEqual(
      postgres.ports.map((port) => [port.host_ip, port.published, port.target]),
      [['127.0.0.1', '15432', 5432]],
    )
    assert.equal(guest.profiles, undefined)
  }
}

try {
  for (const file of files)
    copyFileSync(join(repository, file), join(directory, file))
  writeEnvironment('.env.production', values)
  const production = ['-f', 'docker-compose.prod.yml']
  checkModel(configuration(production), 'aparts')
  console.log('Production loads .env.production without --env-file')

  const magicmop = ['-f', 'docker-compose.magicmop.yml']
  checkModel(configuration(magicmop), 'magicmop')
  console.log('MagicMop overrides preserve isolated ports, volumes and brand')

  const customValues = {
    ...values,
    POSTGRES_DB: 'custom_check',
    DATABASE_URL:
      'postgres://compose_check:compose_check_password@postgres:5432/custom_check',
    NUXT_PUBLIC_APP_URL: 'https://custom.example.test',
  }
  writeEnvironment('custom.env', customValues)
  checkModel(
    configuration(production, {
      APARTS_ENV_FILE: join(directory, 'custom.env'),
    }),
    'aparts',
    customValues,
  )
  checkModel(
    configuration(
      [
        '-p',
        'magicmop',
        '--env-file',
        join(directory, 'custom.env'),
        ...magicmop,
      ],
      {
        APARTS_ENV_FILE: join(directory, 'custom.env'),
        CRM_DEPLOY_BRAND: 'magicmop',
      },
    ),
    'magicmop',
    customValues,
  )
  console.log('Custom env path and deployment invocation remain supported')

  writeEnvironment('.env.production', { ...values, NUXT_VAPID_PRIVATE_KEY: '' })
  assert.throws(
    () => configuration(production),
    (error) => error.stderr?.includes('NUXT_VAPID_PRIVATE_KEY is required'),
  )
  rmSync(join(directory, '.env.production'))
  assert.throws(
    () => configuration(production),
    (error) => error.stderr?.includes('.env.production'),
  )
  console.log('Missing required values and missing env file fail explicitly')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
