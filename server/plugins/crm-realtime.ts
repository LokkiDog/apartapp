import { listenForDatabaseEvents } from '../infrastructure/notification/database-events'

export default defineNitroPlugin(async nitroApp => {
  const listener = await listenForDatabaseEvents()
  nitroApp.hooks.hook('close', async () => { await listener.unlisten() })
})
