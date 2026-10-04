import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
const inserted = vi.hoisted(() => vi.fn())
vi.mock('../server/infrastructure/database/client', () => ({ db: { insert: () => ({ values: inserted }) } }))
afterEach(() => { vi.unstubAllGlobals(); inserted.mockClear() })
async function audit(method: string, status: number, isSuperuser: boolean) {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  const plugin = (await import('../server/plugins/platform-audit')).default
  let callback: ((event: ReturnType<typeof createEvent>) => Promise<void>) | undefined
  plugin({ hooks: { hook: (_name: string, handler: typeof callback) => { callback = handler } } } as any)
  const request = new IncomingMessage(new Socket()); request.method = method; request.url = '/api/hotels/tenant-hotel'
  const event = createEvent(request, new ServerResponse(request)); event.node.res.statusCode = status
  event.context.platformActor = { id: 'real-superuser', organizationId: 'selected-client', isSuperuser }
  await callback!(event)
}
describe('support operation audit', () => {
  it('captures successful support changes under the real actor and selected client', async () => {
    await audit('PATCH', 200, true)
    expect(inserted).toHaveBeenCalledWith({ actorId: 'real-superuser', organizationId: 'selected-client', action: 'client.operation_completed', payload: { method: 'PATCH', path: '/api/hotels/tenant-hotel', status: 200 } })
  })
  it('distinguishes failed support changes', async () => {
    await audit('DELETE', 403, true)
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ action: 'client.operation_failed', payload: expect.objectContaining({ status: 403 }) }))
  })
  it('leaves reads and ordinary client operations to existing domain audit', async () => {
    await audit('GET', 200, true); await audit('POST', 200, false)
    expect(inserted).not.toHaveBeenCalled()
  })
})
