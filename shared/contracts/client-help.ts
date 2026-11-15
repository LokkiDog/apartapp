import type { UserRole } from './crm'

export interface ClientHelp {
  settingsUrl: string
  guestsEnabled: boolean
  messagingEnabled: boolean
  members: Array<{
    id: string
    name: string
    roles: UserRole[]
    status: 'invited' | 'active' | 'blocked'
    agentState: 'inactive_account' | 'organization_blocked' | 'no_permissions' | 'paused' | 'not_connected' | 'expired' | 'permissions_changed' | 'connected'
  }>
}
