import { syncAllIcalFeeds } from '../modules/calendar-import/ical.service'

export default defineNitroPlugin(nitroApp => {
  void syncAllIcalFeeds().catch(error => console.error('[ical-sync] startup sync failed', error))
  const timer = setInterval(() => {
    void syncAllIcalFeeds().catch(error => console.error('[ical-sync] scheduled sync failed', error))
  }, 15 * 60 * 1000)
  timer.unref?.()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
