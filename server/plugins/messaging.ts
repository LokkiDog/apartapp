import { processMessagingOutbox } from '../modules/messaging/outbox'

export default defineNitroPlugin((nitroApp) => {
  let running = false
  async function tick() {
    if (running) return
    running = true
    try {
      await processMessagingOutbox()
    } catch {
      console.error('[messaging] queue processing failed')
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => {
    void tick()
  }, 2000)
  timer.unref?.()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
