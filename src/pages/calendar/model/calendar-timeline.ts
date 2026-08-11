export type CalendarTimelineStay = {
  id: string
  apartmentId: string
  checkInOn: string
  checkOutOn: string
}

export type CalendarStaySegment<TStay extends CalendarTimelineStay = CalendarTimelineStay> = {
  stay: TStay
  startHalf: number
  endHalf: number
  continuesLeft: boolean
  continuesRight: boolean
  hasActualArrival: boolean
  hasActualDeparture: boolean
  lane: number
}

export type CalendarWeekLayout<TStay extends CalendarTimelineStay = CalendarTimelineStay> = {
  key: string
  from: string
  to: string
  segments: Array<CalendarStaySegment<TStay>>
  laneCount: number
  hiddenStayCount: number
}

const DAY_MS = 86_400_000

function dayOffset(from: string, value: string) {
  return Math.round((Date.parse(`${value}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS)
}

function overlaps(left: CalendarStaySegment, right: CalendarStaySegment) {
  return left.startHalf < right.endHalf && left.endHalf > right.startHalf
}

function startsAfterDeparture<TStay extends CalendarTimelineStay>(stay: TStay, stays: readonly TStay[]) {
  return stays.some(candidate => candidate.id !== stay.id
    && candidate.apartmentId === stay.apartmentId
    && candidate.checkOutOn === stay.checkInOn)
}

export function createStaySegment<TStay extends CalendarTimelineStay>(
  stay: TStay,
  periodFrom: string,
  periodTo: string,
  stays: readonly TStay[]
): CalendarStaySegment<TStay> | null {
  if (stay.checkInOn >= periodTo || stay.checkOutOn < periodFrom) return null

  const continuesLeft = stay.checkInOn < periodFrom
  const continuesRight = stay.checkOutOn >= periodTo
  const hasActualArrival = !continuesLeft && stay.checkInOn < periodTo
  const hasActualDeparture = !continuesRight && stay.checkOutOn >= periodFrom
  const startHalf = continuesLeft
    ? 0
    : dayOffset(periodFrom, stay.checkInOn) * 2 + (startsAfterDeparture(stay, stays) ? 1 : 0)
  const endHalf = continuesRight
    ? dayOffset(periodFrom, periodTo) * 2
    : dayOffset(periodFrom, stay.checkOutOn) * 2 + 1

  if (endHalf <= startHalf) return null

  return {
    stay,
    startHalf,
    endHalf,
    continuesLeft,
    continuesRight,
    hasActualArrival,
    hasActualDeparture,
    lane: 0
  }
}

export function createWeekSegments<TStay extends CalendarTimelineStay>(
  stays: readonly TStay[],
  periodFrom: string,
  periodTo: string
) {
  return stays
    .map(stay => createStaySegment(stay, periodFrom, periodTo, stays))
    .filter((segment): segment is CalendarStaySegment<TStay> => segment !== null)
    .sort((left, right) => left.startHalf - right.startHalf
      || right.endHalf - left.endHalf
      || left.stay.id.localeCompare(right.stay.id))
}

export function assignMonthWeekLanes<TStay extends CalendarTimelineStay>(
  stays: readonly TStay[],
  weeks: ReadonlyArray<{ from: string, to: string }>,
  collapsedLaneCount = 3
): Array<CalendarWeekLayout<TStay>> {
  const preferredLanes = new Map<string, number>()

  return weeks.map(week => {
    const segments = createWeekSegments(stays, week.from, week.to)
      .sort((left, right) => Number(preferredLanes.has(right.stay.id)) - Number(preferredLanes.has(left.stay.id))
        || left.startHalf - right.startHalf
        || right.endHalf - left.endHalf
        || left.stay.id.localeCompare(right.stay.id))
    const lanes: Array<Array<CalendarStaySegment<TStay>>> = []

    for (const segment of segments) {
      const preferredLane = preferredLanes.get(segment.stay.id)
      let lane = preferredLane !== undefined && !(lanes[preferredLane] ?? []).some(existing => overlaps(existing, segment))
        ? preferredLane
        : lanes.findIndex(existing => !existing.some(placed => overlaps(placed, segment)))

      if (lane < 0) lane = lanes.length
      if (!lanes[lane]) lanes[lane] = []
      segment.lane = lane
      lanes[lane].push(segment)
      preferredLanes.set(segment.stay.id, lane)
    }

    segments.sort((left, right) => left.lane - right.lane
      || left.startHalf - right.startHalf
      || left.stay.id.localeCompare(right.stay.id))

    return {
      key: week.from,
      from: week.from,
      to: week.to,
      segments,
      laneCount: lanes.length,
      hiddenStayCount: new Set(segments.filter(segment => segment.lane >= collapsedLaneCount).map(segment => segment.stay.id)).size
    }
  })
}
