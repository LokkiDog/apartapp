import { listPasskeys } from '../../../modules/auth/passkey.service'
export default defineEventHandler(event => listPasskeys(event))
