import Decimal from 'decimal.js'

type Tariff = { ownerTotalEur: number; cleanerPoolEur: number; laundryEur: number; serviceEur: number }
type UsageMovement = { apartmentId: string; consumableId: string; quantity: string; totalCostEur: number }

export function canBeWorkAssignee(roles: string[]) {
  return roles.includes('cleaner') || roles.includes('administrator') || roles.includes('specialist')
}

export function canBeCleaningAssignee(roles: string[]) {
  return roles.includes('cleaner') || roles.includes('administrator')
}

export function canChangeTaskApartment(status: string, hasInventoryMovements: boolean) {
  return status === 'open' && !hasInventoryMovements
}

export function cleaningTariffHasChanged(before: Tariff, after: Tariff) {
  return (['ownerTotalEur', 'cleanerPoolEur', 'laundryEur', 'serviceEur'] as const)
    .some(field => Number(before[field]) !== Number(after[field]))
}

export function restoredInventoryLot(movement: UsageMovement) {
  const quantity = new Decimal(movement.quantity)
  return {
    apartmentId: movement.apartmentId,
    consumableId: movement.consumableId,
    remainingQuantity: movement.quantity,
    unitCostEur: quantity.isZero()
      ? 0
      : Number(new Decimal(movement.totalCostEur).dividedBy(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
  }
}
