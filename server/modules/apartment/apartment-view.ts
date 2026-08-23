export type ApartmentManager = { id: string, name: string }

export function serializeApartment<T extends { managerAssignments: Array<{ manager: ApartmentManager }> }>(apartment: T) {
  const { managerAssignments, ...rest } = apartment
  return {
    ...rest,
    managers: managerAssignments
      .map(assignment => assignment.manager)
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  }
}
