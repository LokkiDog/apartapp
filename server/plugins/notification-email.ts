import { processNotificationEmails } from '../infrastructure/notification/email-queue'

export default defineNitroPlugin(nitroApp => {
  let running = false
  async function tick() {
    if (running) return
    running = true
    try { await processNotificationEmails() }
    catch { console.error('[notification-email] queue processing failed') }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 30_000)
  timer.unref?.()
  void tick()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
