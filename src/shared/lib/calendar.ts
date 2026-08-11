const calendarColors = [
  { background: '#e7f2ed', foreground: '#195844', departure: '#9dcfba' },
  { background: '#eaf1f8', foreground: '#285d7a', departure: '#a9c9df' },
  { background: '#f6eee4', foreground: '#855329', departure: '#dfc39e' },
  { background: '#f0ebf7', foreground: '#62468a', departure: '#c9b8df' },
  { background: '#f9ecee', foreground: '#91444d', departure: '#e4b2b7' }
]

export function apartmentCalendarColor(id: string) {
  const index = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7) % calendarColors.length
  return calendarColors[index]!
}
