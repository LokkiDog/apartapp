const localApartsUrl = 'postgres://aparts:aparts@localhost:55432/aparts'
const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export function crmDatabaseUrl(brand = 'aparts', configuredUrl?: string) {
  if (brand !== 'magicmop' && brand !== 'aparts') throw new Error('CRM_BRAND must be aparts or magicmop.')
  const connectionString = configuredUrl || (brand === 'aparts' ? localApartsUrl : '')
  const url = URL.canParse(connectionString) ? new URL(connectionString) : null
  if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
    ['database', 'dbname', 'db', 'host', 'hostaddr', 'port'].some(key => url.searchParams.has(key))) {
    throw new Error(`Set DATABASE_URL to an explicit PostgreSQL URL for ${brand}.`)
  }

  const database = url.pathname.slice(1)
  const localPort = localDatabaseHosts.has(url.hostname) ? url.port : ''
  const matches = brand === 'magicmop'
    ? database === 'magicmop' && url.hostname !== 'postgres-aparts' && localPort !== '55432'
    : /^aparts(?:_[a-z0-9_]+)?$/.test(database) && url.hostname !== 'postgres-magicmop' && localPort !== '52951'
  if (!matches) {
    throw new Error(`DATABASE_URL does not target the ${brand} database. Check the database name, host and port before starting or migrating CRM.`)
  }
  return connectionString
}
