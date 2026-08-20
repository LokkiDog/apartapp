export type WorkActionKey = 'stock' | 'inventory' | 'complete' | 'cancel' | 'edit' | 'delete'

type ActionContext = {
  status: string
  isAdministrator: boolean
  canStock: boolean
  canOperate: boolean
  canCancel?: boolean
}

export function cleaningActionKeys(context: ActionContext): WorkActionKey[] {
  const actions: WorkActionKey[] = []
  const active = ['assigned', 'in_progress'].includes(context.status)
  if (active && context.canStock) actions.push('stock')
  if (context.isAdministrator && context.status === 'completed') actions.push('inventory')
  if (active && context.canOperate) actions.push('complete')
  if (context.isAdministrator && !['completed', 'canceled'].includes(context.status)) actions.push('edit')
  if (context.isAdministrator) actions.push('delete')
  return actions
}

export function taskActionKeys(context: ActionContext): WorkActionKey[] {
  const actions: WorkActionKey[] = []
  const active = ['open', 'in_progress'].includes(context.status)
  if (active && context.canStock) actions.push('stock')
  if (active && context.canOperate) actions.push('complete')
  if (active && context.canCancel) actions.push('cancel')
  if (context.isAdministrator && active) actions.push('edit')
  if (context.isAdministrator) actions.push('delete')
  return actions
}
