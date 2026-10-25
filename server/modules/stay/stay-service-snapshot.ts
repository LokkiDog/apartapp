import type { NameTranslations } from '../../../shared/utils/localized-name'

export type StayServiceSnapshotSource = {
  id: string
  name: string
  nameTranslations?: NameTranslations
  iconName: string
  priceEur: number
  managerSharePercent: number
}

export function buildStayServiceSnapshot(stayId: string, service: StayServiceSnapshotSource) {
  return {
    stayId,
    specialServiceId: service.id,
    nameSnapshot: service.name,
    nameTranslationsSnapshot: { ...service.nameTranslations },
    iconNameSnapshot: service.iconName,
    priceEurSnapshot: service.priceEur,
    managerSharePercentSnapshot: service.managerSharePercent
  }
}
