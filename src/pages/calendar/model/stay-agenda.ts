export type StayAgendaStatus = 'departure' | 'arrival' | 'staying'

export type StayAgendaSource = {
  id: string
  checkInOn: string
  checkOutOn: string
}

export type StayAgendaItem<Stay extends StayAgendaSource> = {
  stay: Stay
  status: StayAgendaStatus
}

export type StayAgendaCategory<Stay extends StayAgendaSource> = {
  status: StayAgendaStatus
  items: Array<StayAgendaItem<Stay>>
}

export type StayAgendaDay<Stay extends StayAgendaSource> = {
  date: string
  categories: Array<StayAgendaCategory<Stay>>
  counts: Record<StayAgendaStatus, number>
  totalCount: number
}

const categoryOrder: StayAgendaStatus[] = ['departure', 'arrival', 'staying']

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function stayAgendaQueryFrom(today: string) {
  return addDays(today, -1)
}

export function stayHistoryQueryFrom(today: string, days: number) {
  return addDays(today, -(days + 1))
}

export function isPastStay(stay: Pick<StayAgendaSource, 'checkOutOn'>, today: string) {
  return stay.checkOutOn < today
}

export function createStayAgenda<Stay extends StayAgendaSource>(stays: Stay[], today: string): Array<StayAgendaDay<Stay>> {
  const relevantStays = stays.filter(stay => stay.checkOutOn >= today)
  const lastDate = relevantStays.reduce<string | null>((latest, stay) => !latest || stay.checkOutOn > latest ? stay.checkOutOn : latest, null)
  if (!lastDate) return []

  const days: Array<StayAgendaDay<Stay>> = []
  for (let date = today; date <= lastDate; date = addDays(date, 1)) {
    const itemsByStatus: Record<StayAgendaStatus, Array<StayAgendaItem<Stay>>> = {
      departure: [],
      arrival: [],
      staying: []
    }

    for (const stay of relevantStays) {
      if (stay.checkOutOn === date) itemsByStatus.departure.push({ stay, status: 'departure' })
      else if (stay.checkInOn === date) itemsByStatus.arrival.push({ stay, status: 'arrival' })
      else if (stay.checkInOn < date && stay.checkOutOn > date) itemsByStatus.staying.push({ stay, status: 'staying' })
    }

    const counts = categoryOrder.reduce<Record<StayAgendaStatus, number>>((result, status) => {
      result[status] = itemsByStatus[status].length
      return result
    }, { departure: 0, arrival: 0, staying: 0 })
    const totalCount = categoryOrder.reduce((total, status) => total + counts[status], 0)

    if (!totalCount) continue
    days.push({
      date,
      categories: categoryOrder.map(status => ({ status, items: itemsByStatus[status] })),
      counts,
      totalCount
    })
  }
  return days
}

export function filterStayAgenda<Stay extends StayAgendaSource>(days: StayAgendaDay<Stay>[], statuses: readonly StayAgendaStatus[]): Array<StayAgendaDay<Stay>> {
  const selected = new Set(statuses)
  return days.map(day => {
    const categories = day.categories.filter(category => selected.has(category.status))
    const totalCount = categories.reduce((total, category) => total + category.items.length, 0)
    return { ...day, categories, totalCount }
  }).filter(day => day.totalCount > 0)
}
