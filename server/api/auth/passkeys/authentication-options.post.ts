import { passkeyAuthenticationOptions } from '../../../modules/auth/passkey.service'
export default defineEventHandler(event => passkeyAuthenticationOptions(event))
