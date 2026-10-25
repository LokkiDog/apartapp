import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '../../server/modules/auth/passkey.service'

// A real ES256 authenticator fixture: none attestation, RP hash, UV flags and
// signed assertions. No verification functions are mocked.
export function authenticator() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const id = randomBytes(32)
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]
  ]))
  const digest = (data: string | Buffer) => createHash('sha256').update(data).digest()
  function authData(rpID: string, flags: number, counter: number) {
    const count = Buffer.alloc(4); count.writeUInt32BE(counter)
    return Buffer.concat([digest(rpID), Buffer.from([flags]), count])
  }
  function clientData(type: string, challenge: string, origin: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  }
  return {
    id: id.toString('base64url'),
    registration(challenge: string, origin = 'https://aparts.example'): RegistrationResponseJSON {
      const length = Buffer.alloc(2); length.writeUInt16BE(id.length)
      const data = Buffer.concat([authData(new URL(origin).hostname, 0x45, 0), Buffer.alloc(16), length, id, cose])
      const attestation = isoCBOR.encode(new Map<string, string | Uint8Array | Map<string, string>>([
        ['fmt', 'none'], ['authData', data], ['attStmt', new Map()]
      ]))
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {}, response: {
        clientDataJSON: clientData('webauthn.create', challenge, origin).toString('base64url'), attestationObject: Buffer.from(attestation).toString('base64url'), transports: ['internal']
      } }
    },
    assertion(challenge: string, userId: string, { origin = 'https://aparts.example', rpID = 'aparts.example', flags = 5, counter = 1 } = {}): AuthenticationResponseJSON {
      const client = clientData('webauthn.get', challenge, origin)
      const data = authData(rpID, flags, counter)
      const signature = sign('sha256', Buffer.concat([data, digest(client)]), privateKey)
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {}, response: {
        clientDataJSON: client.toString('base64url'), authenticatorData: data.toString('base64url'), signature: signature.toString('base64url'), userHandle: Buffer.from(userId).toString('base64url')
      } }
    }
  }
}
