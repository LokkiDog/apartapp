import { requireActor } from '../../infrastructure/auth/actor'
export default defineEventHandler(async event => requireActor(event))
