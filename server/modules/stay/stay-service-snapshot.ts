export type StayServiceSnapshotSource = {
  id: string
  name: string
  iconName: string
  priceEur: number
  managerSharePercent: number
}

export function buildStayServiceSnapshot(stayId: string, service: StayServiceSnapshotSource) {
  return {
    stayId,
    specialServiceId: service.id,
    nameSnapshot: service.name,
    iconNameSnapshot: service.iconName,
    priceEurSnapshot: service.priceEur,
    managerSharePercentSnapshot: service.managerSharePercent
  }
}
