import { requirePrincipal } from '../../infrastructure/auth/platform'
export default defineEventHandler(async event => requirePrincipal(event))
