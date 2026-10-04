import { requireSuperuser } from '../../../infrastructure/auth/platform'
import { listClients } from '../../../modules/platform/platform.service'
export default defineEventHandler(async event => { return listClients(await requireSuperuser(event)) })
