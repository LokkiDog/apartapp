import { bootstrapAdministrator } from '../infrastructure/seed/bootstrap'

export default defineNitroPlugin(async () => {
  await bootstrapAdministrator()
})
