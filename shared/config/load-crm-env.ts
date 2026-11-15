export function loadCrmEnv(file = process.env.CRM_ENV_FILE || '.env') {
  try {
    process.loadEnvFile(file)
  } catch (cause) {
    // Deployments can supply the configuration directly in the process environment.
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT' || file !== '.env') throw cause
  }
}
